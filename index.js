"use strict";
const fs = require("fs");
const { detailedDiff } = require("deep-object-diff");
const chalk = require("chalk");
const emoji = require("node-emoji");
const warning = emoji.get("warning");
const fire = emoji.get("fire");
const cwd = process.cwd();

module.exports = function (results, context, logger = console) {
  const filesLinted = [];
  const latestIssues = {};

  // Get previous/latest warning/error counts overall and group them per file/rule
  let previousIssues = {};
  if (fs.existsSync("./eslint-ratchet.json")) {
    previousIssues = JSON.parse(fs.readFileSync("./eslint-ratchet.json"));
  }

  // Loop over results and store them as file/rule/issueType:count. Ex:
  // Ex:
  // {
  //   "some/file.js": {
  //     "an-eslint-rule": {
  //       "warning": 1,
  //       "error": 2
  //     }
  //   }
  // }
  results.forEach(({ messages, filePath, errorCount, warningCount }) => {
    const file = filePath.replace(`${cwd}/`, "");
    filesLinted.push(file);
    if (errorCount > 0 || warningCount > 0) {
      latestIssues[file] = {};
      messages.forEach(({ ruleId, severity }) => {
        latestIssues[file][ruleId] = latestIssues[file][ruleId] || {
          warning: 0,
          error: 0,
        };
        latestIssues[file][ruleId].warning += severity === 1 ? 1 : 0;
        latestIssues[file][ruleId].error += severity === 2 ? 1 : 0;
      });
    }
  });

  // Store these latest results up front.
  // These are mentioned in the logging whenever counts increase and allow for easy updating
  // when those increases were expected.
  fs.writeFileSync(
    "./eslint-ratchet-temp.json",
    JSON.stringify({ ...previousIssues, ...latestIssues }, null, 4)
  );

  // Perform a basic check to see if anything has changed
  const diff = detailedDiff(previousIssues, latestIssues);
  const { added, updated, deleted } = diff;

  // Filter results to just those that are for the linted files.
  // Since the latest issues will have a diff of `undefined` all we need to do is
  // filter the results to those that aren't null/undefined
  const addsMatchingLintedFiles = Object.entries(added).filter(([k, v]) =>
    filesLinted.includes(k)
  );
  const updatesMatchingLintedFiles = Object.entries(updated).filter(([k, v]) =>
    filesLinted.includes(k)
  );
  const deletesMatchingLintedFiles = Object.entries(deleted).filter(([k, v]) =>
    filesLinted.includes(k)
  );

  // Also look for files that were previously linted but no longer exist.
  // This helps account for times when linting may only be performed against a subset of files
  // but one or more of the previous files has been removed.
  const missingFiles = Object.keys(previousIssues).filter(
    (filepath) => !fs.existsSync(filepath)
  );

  const hasChanged =
    missingFiles.length != 0 ||
    addsMatchingLintedFiles.length != 0 ||
    updatesMatchingLintedFiles.length != 0 ||
    deletesMatchingLintedFiles.length != 0;

  // If there are changes find/log/save differences
  if (hasChanged) {
    logger.group(
      chalk.yellow(
        warning,
        ` eslint-ratchet: Changes to eslint results detected!!!`
      )
    );

    // Loop over the changes to determine and log what's different
    const { newIssues, updatedResults } = detectAndLogChanges(
      previousIssues,
      filesLinted,
      added,
      updated,
      deleted,
      logger
    );

    // If we find any "issues" (increased/new counts) throw a warning and fail the ratcheting check
    if (newIssues > 0) {
      logger.log(
        fire,
        chalk.red(` New eslint-ratchet issues have been detected!!!`)
      );
      logger.log(
        `These latest eslint results have been saved to ${chalk.yellow.underline(
          "eslint-ratchet-temp.json"
        )}. \nIf these results were expected then use them to replace the content of ${chalk.white.underline(
          "eslint-ratchet.json"
        )} and check it in.`
      );
      throw new Error("View output above for more details");
    } else {
      // Otherwise update the ratchet tracking and log a message about it
      fs.writeFileSync(
        "./eslint-ratchet.json",
        JSON.stringify(updatedResults, null, 4)
      );
      fs.writeFileSync(
        "./eslint-ratchet-temp.json",
        JSON.stringify({}, null, 4)
      );
      return chalk.green(
        `Changes found are all improvements! These new results have been saved to ${chalk.white.underline(
          "eslint-ratchet.json"
        )}`
      );
    }
  }

  // Because eslint expects a string response from formatters, but our messaging is already complete, just
  // return an empty string.
  return "";
};

// Log the results of a change based on the type of change.
const logColorfulValue = (violationType, value, previously, color, logger) => {
  logger.log(
    `--> ${violationType}: ${chalk[color](value)} (previously: ${chalk.yellow(
      previously
    )})`
  );
};

// Loop over the latest results and detect changes within each type.
// In cases where any change is detected it is logged with the previous result and color coded
const detectAndLogChanges = (
  previousResults,
  filesLinted,
  added,
  updated,
  deleted,
  logger
) => {
  // Keep track of any new issues - where the counts for a previously reported
  // issue have gone up
  let newIssues = 0;
  const updatedResults = Object.assign({}, previousResults);

  Object.entries({ added, updated, deleted }).forEach(([setKey, set]) => {
    Object.entries(set).forEach(([fileKey, fileValue]) => {
      // Only check against files that were linted in the latest run.
      const fileLinted = filesLinted.includes(fileKey);
      if (!fileLinted) {
        // Check to see if the file wasn't linted because it no longer exists
        // If it does exist then it wasn't a part of the latest run, like when running against staged files,
        // and its previous results are safe to ignored.
        // If it doesn't exist then any error counts associated with it should be removed and are accounted
        // for later on.
        const exists = fs.existsSync(fileKey);
        if (exists) return;
      }

      logger.group(chalk.white.underline(fileKey));
      let previousFileResults = previousResults[fileKey];

      // For our "deleted" issues, or issues that we've fixed that no longer reported,
      // there is nothing new to compare against so instead create an empty case.
      if (!fileValue && setKey === "deleted") {
        fileValue = {};
        Object.keys(previousFileResults).forEach((key) => {
          fileValue[key] = { warning: 0, error: 0 };
        });
      }

      // Check if the new value for each rule/result is higher (worse) or lower (better) than before
      Object.entries(fileValue).forEach(([rule, result]) => {
        logger.group(rule);

        // If the issue is no longer valid log and remove it.
        // Removal at this stage only applies to cases where there are no longer any issues.
        if (!result) {
          logger.log(`--> ${chalk.green("all issues resolved")}`);
          if (updatedResults[fileKey][rule])
            delete updatedResults[fileKey][rule];
        } else if (result) {
          Object.entries(result).forEach(([violationType, value]) => {
            // Fill in missing rules when entirely new cases are added.
            // This can happen in multiple cases, like:
            // - when a new file is added but has issues
            // - when a linter's rules are changed and it now reports more issues
            // - when a new linter is added and begins reporting on new issues
            if (!previousFileResults && setKey === "added") {
              previousFileResults = {};
            }
            let previousRule = previousFileResults[rule];
            if (!previousRule && setKey === "added") {
              previousRule = { warning: 0, error: 0 };
            }
            const previousValue = previousRule[violationType];

            //Report the change and track if new issues have occurred
            if (value > previousValue) {
              newIssues += 1;
              logColorfulValue(
                violationType,
                value,
                previousValue,
                "red",
                logger
              );
            } else if (value < previousValue) {
              logColorfulValue(
                violationType,
                value,
                previousValue,
                "green",
                logger
              );
            }

            // Set the updated value for the violation
            updatedResults[fileKey] = updatedResults[fileKey] || {};
            updatedResults[fileKey][rule] = updatedResults[fileKey][rule] || {};
            updatedResults[fileKey][rule][violationType] = value;
          });
        }

        // Clean up results where issues have been fixed
        // Remove 0 counts - no need to track them
        if (result?.warning === 0) delete updatedResults[fileKey][rule].warning;
        if (result?.error === 0) delete updatedResults[fileKey][rule].error;

        // Remove rules without issues
        if (updatedResults[fileKey] && updatedResults[fileKey][rule]) {
          if (Object.keys(updatedResults[fileKey][rule]).length === 0) {
            delete updatedResults[fileKey][rule];
          }
        }

        // Remove files without issues
        if (updatedResults[fileKey]) {
          if (Object.keys(updatedResults[fileKey]).length === 0) {
            delete updatedResults[fileKey];
          }
        }

        logger.groupEnd();
      });
      logger.groupEnd();
    });
  });

  return { newIssues, updatedResults };
};
