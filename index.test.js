const os = require("os");
const path = require("path");
const fs = require("fs");
const formatter = require(".");

const originalCwd = process.cwd();
let tempDir;
let messages = [];

const logger = {
  log: (m) => messages.push(m),
  group: (m) => messages.push(m),
  groupEnd: () => {},
};

describe("eslint-ratchet", () => {
  beforeEach(function () {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eslint-ratchet-test-"));
    process.chdir(tempDir);
    messages = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("doesn't throw errors or log extra messages when there are no changes", () => {
    setupMocks();
    formatter(getMockResults(), null, logger);
    expect(messages).toHaveLength(1);
  });

  it("throws errors and logs messages when violations increase", () => {
    const newResults = getMockResults();
    newResults[1].errorCount = 3;
    newResults[1].messages.push({
      ruleId: "react/jsx-no-target-blank",
      severity: 2,
      message:
        'Using target="_blank" without rel="noreferrer" (which implies rel="noopener") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations',
      messageId: "noTargetBlankWithoutNoreferrer",
    });
    const expectedLatest = {
      "some/path/file-a.jsx": {
        "react/jsx-no-target-blank": {
          warning: 0,
          error: 3,
        },
      },
      "another/path/file-b.js": {
        "@productplan/custom-rules/throw-or-log": {
          warning: 2,
          error: 0,
        },
      },
    };
    const expectedMessages = [
      "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
      "some/path/file-a.jsx",
      "react/jsx-no-target-blank",
      "--> error: 3 (previously: 2)",
      "🔥",
      "These latest eslint results have been saved to eslint-ratchet-temp.json. \nIf these results were expected then use them to replace the content of eslint-ratchet.json and check it in.",
    ];

    setupMocks();
    expect(() => formatter(newResults, null, logger)).toThrow();
    expect(messages).toEqual(expect.arrayContaining(expectedMessages));

    const newValues = JSON.parse(fs.readFileSync("./eslint-ratchet-temp.json"));
    expect(JSON.stringify(newValues)).toBe(JSON.stringify(expectedLatest));
  });

  it("updates thresholds and logs messages when violations decrease", () => {
    const newResults = getMockResults();
    newResults[1].errorCount = 0;
    newResults[1].messages = [];
    const expectedLatest = {
      "another/path/file-b.js": {
        "@productplan/custom-rules/throw-or-log": { warning: 2, error: 0 },
      },
    };
    const expectedMessages = [
      "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
      "some/path/file-a.jsx",
      "react/jsx-no-target-blank",
      "--> error: 0 (previously: 2)",
    ];

    setupMocks();
    formatter(newResults, null, logger);
    expect(messages).toEqual(expect.arrayContaining(expectedMessages));

    const newValues = JSON.parse(fs.readFileSync("./eslint-ratchet.json"));
    expect(JSON.stringify(newValues)).toBe(JSON.stringify(expectedLatest));
  });

  it("updates thresholds and logs messages when files are removed", () => {
    const newResults = getMockResults().filter((v, i) => i !== 1);
    const expectedLatest = {
      "another/path/file-b.js": {
        "@productplan/custom-rules/throw-or-log": { warning: 2, error: 0 },
      },
    };
    const expectedMessages = [
      "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
      "some/path/file-a.jsx",
      "react/jsx-no-target-blank",
      "--> error: 0 (previously: 2)",
    ];

    setupMissingFileMocks();
    formatter(newResults, null, logger);
    expect(messages).toEqual(expect.arrayContaining(expectedMessages));
    const newValues = JSON.parse(fs.readFileSync("./eslint-ratchet.json"));
    expect(JSON.stringify(newValues)).toBe(JSON.stringify(expectedLatest));
  });

  it("doesn't update thresholds for files which weren't linted", () => {
    const newResults = getMockResults().filter((v, i) => i !== 1);
    const expectedLatest = getMockThresholds();

    setupMocks();
    formatter(newResults, null, logger);
    const newValues = JSON.parse(fs.readFileSync("./eslint-ratchet.json"));
    expect(JSON.stringify(newValues)).toBe(JSON.stringify(expectedLatest));
  });

  it("considers all issues as new if no previous results are found", () => {
    const newResults = getMockResults();
    const expectedMessages = [
      "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
      "some/path/file-a.jsx",
      "react/jsx-no-target-blank",
      "--> error: 2 (previously: 0)",
      "another/path/file-b.js",
      "@productplan/custom-rules/throw-or-log",
      "--> warning: 2 (previously: 0)",
      "🔥",
      "These latest eslint results have been saved to eslint-ratchet-temp.json. \n" +
        "If these results were expected then use them to replace the content of eslint-ratchet.json and check it in.",
    ];
    setupMocks();
    fs.unlinkSync("./eslint-ratchet.json");
    expect(() => formatter(newResults, null, logger)).toThrow();
    expect(messages).toEqual(expect.arrayContaining(expectedMessages));
  });

  it("removes tracking when there are no more issues", () => {
    const newResults = [
      {
        filePath: "app/assets/javascripts/actions/notification-actions.js",
        messages: [],
        errorCount: 0,
        warningCount: 0,
      },
    ];
    const expectedMessages = [
      "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
      "app/assets/javascripts/actions/notification-actions.js",
      "react/jsx-no-target-blank",
      "--> error: 0 (previously: 2)",
    ];

    setupMocks({
      "app/assets/javascripts/actions/notification-actions.js": "",
      "eslint-ratchet.json": JSON.stringify({
        "app/assets/javascripts/actions/notification-actions.js": {
          "react/jsx-no-target-blank": {
            error: 2,
          },
        },
      }),
    });
    formatter(newResults, null, logger);
    expect(messages).toEqual(expect.arrayContaining(expectedMessages));
  });

  it("logs 'all issues resolved' when a specific rule is fixed while others remain", () => {
    const newResults = getMockResults();

    setupMocks({
      "eslint-ratchet.json": JSON.stringify({
        "some/path/file-a.jsx": {
          "react/jsx-no-target-blank": { warning: 0, error: 2 },
          "react/no-danger": { warning: 0, error: 1 },
        },
        "another/path/file-b.js": {
          "@productplan/custom-rules/throw-or-log": { warning: 2, error: 0 },
        },
      }),
    });

    formatter(newResults, null, logger);
    expect(messages).toContain("--> all issues resolved");
  });

  it("sees completely new warnings as regressions", () => {
    const newResults = getMockResults();
    newResults[2].warningCount = 3;
    newResults[2].messages.push({
      ruleId: "@productplan/custom-rules/throw-or-log",
      severity: 1,
    });
    const expectedMessages = [
      "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
      "another/path/file-b.js",
      "@productplan/custom-rules/throw-or-log",
      "--> warning: 3 (previously: 2)",
      "🔥",
    ];

    setupMocks();
    expect(() => formatter(newResults, null, logger)).toThrow();
    expect(messages).toEqual(expect.arrayContaining(expectedMessages));
  });

  it("sees a brand new file with violations as a regression", () => {
    const newResults = getMockResults();
    newResults.push({
      filePath: "brand/new/file.js",
      messages: [{ ruleId: "no-console", severity: 2 }],
      errorCount: 1,
      warningCount: 0,
    });
    const expectedMessages = [
      "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
      "brand/new/file.js",
      "no-console",
      "--> error: 1 (previously: 0)",
      "🔥",
    ];

    setupMocks({
      "brand/new/file.js": "",
    });
    expect(() => formatter(newResults, null, logger)).toThrow();
    expect(messages).toEqual(expect.arrayContaining(expectedMessages));
  });

  it("sees completely new errors as regressions", () => {
    const newResults = getMockResults();
    newResults[1].errorCount++;
    newResults[1].messages.push({
      ruleId: "test/new-error",
      severity: 2,
    });
    const expectedLatest = {
      "some/path/file-a.jsx": {
        "react/jsx-no-target-blank": {
          warning: 0,
          error: 2,
        },
        "test/new-error": {
          warning: 0,
          error: 1,
        },
      },
      "another/path/file-b.js": {
        "@productplan/custom-rules/throw-or-log": {
          warning: 2,
          error: 0,
        },
      },
    };
    const expectedMessages = [
      "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
      "some/path/file-a.jsx",
      "test/new-error",
      "--> error: 1 (previously: 0)",
      "🔥",
      "These latest eslint results have been saved to eslint-ratchet-temp.json. \nIf these results were expected then use them to replace the content of eslint-ratchet.json and check it in.",
    ];

    setupMocks();
    expect(() => formatter(newResults, null, logger)).toThrow();
    expectedMessages.forEach((message) => expect(messages).toContain(message));

    const newValues = JSON.parse(fs.readFileSync("./eslint-ratchet-temp.json"));
    expect(JSON.stringify(newValues)).toBe(JSON.stringify(expectedLatest));
  });

  describe("stripped zero counts in eslint-ratchet.json", () => {
    it("detects a new warning when the warning key was previously stripped", () => {
      // After improvements, zeros are stripped from eslint-ratchet.json.
      // A rule stored as { error: 2 } has an implicit warning count of 0.
      // A new warning on that rule must still be caught as a regression.
      const newResults = [
        {
          filePath: "some/path/file-a.jsx",
          messages: [
            { ruleId: "react/jsx-no-target-blank", severity: 2 },
            { ruleId: "react/jsx-no-target-blank", severity: 2 },
            { ruleId: "react/jsx-no-target-blank", severity: 1 },
          ],
          errorCount: 2,
          warningCount: 1,
        },
      ];
      setupMocks({
        "eslint-ratchet.json": JSON.stringify({
          "some/path/file-a.jsx": {
            "react/jsx-no-target-blank": { error: 2 },
          },
        }),
      });

      expect(() => formatter(newResults, null, logger)).toThrow();
      expect(messages).toContain("--> warning: 1 (previously: 0)");
    });

    it("detects a new error when the error key was previously stripped", () => {
      const newResults = [
        {
          filePath: "another/path/file-b.js",
          messages: [
            { ruleId: "@productplan/custom-rules/throw-or-log", severity: 1 },
            { ruleId: "@productplan/custom-rules/throw-or-log", severity: 1 },
            { ruleId: "@productplan/custom-rules/throw-or-log", severity: 2 },
          ],
          errorCount: 1,
          warningCount: 2,
        },
      ];
      setupMocks({
        "eslint-ratchet.json": JSON.stringify({
          "another/path/file-b.js": {
            "@productplan/custom-rules/throw-or-log": { warning: 2 },
          },
        }),
      });

      expect(() => formatter(newResults, null, logger)).toThrow();
      expect(messages).toContain("--> error: 1 (previously: 0)");
    });

    it("treats a regression as such even when another violation type improves", () => {
      // errors drop (2 → 1) but a new warning appears on a rule that had warning stripped.
      // The improvement doesn't cancel the regression — should still throw.
      const newResults = [
        {
          filePath: "some/path/file-a.jsx",
          messages: [
            { ruleId: "react/jsx-no-target-blank", severity: 2 },
            { ruleId: "react/jsx-no-target-blank", severity: 1 },
          ],
          errorCount: 1,
          warningCount: 1,
        },
      ];
      setupMocks({
        "eslint-ratchet.json": JSON.stringify({
          "some/path/file-a.jsx": {
            "react/jsx-no-target-blank": { error: 2 },
          },
        }),
      });

      expect(() => formatter(newResults, null, logger)).toThrow();
      expect(messages).toContain("--> error: 1 (previously: 2)");
      expect(messages).toContain("--> warning: 1 (previously: 0)");
    });
  });

  describe("option: RATCHET_DEFAULT_EXIT_ZERO", () => {
    it("disabled: does not log", () => {
      setupMocks({ "some/path/file-a.jsx": "", "another/path/file-b.js": "" });
      formatter(getMockResults(), null, logger);
      expect(messages).not.toContain(
        "eslint-ratchet: causing process to exit 0",
      );
    });

    it("enabled: logs and exits", () => {
      process.env.RATCHET_DEFAULT_EXIT_ZERO = "true";
      let exitCode = null;
      vi.spyOn(process, "exit").mockImplementation((code) => {
        exitCode = code;
      });
      setupMocks({ "some/path/file-a.jsx": "", "another/path/file-b.js": "" });
      formatter(getMockResults(), null, logger);
      expect(messages).toContain("eslint-ratchet: causing process to exit 0");
      expect(exitCode).toBe(0);
      delete process.env.RATCHET_DEFAULT_EXIT_ZERO;
    });

    it("enabled: throws errors and logs messages when violations increase", () => {
      process.env.RATCHET_DEFAULT_EXIT_ZERO = "true";
      const newResults = getMockResults();
      newResults[1].errorCount = 3;
      newResults[1].messages.push({
        ruleId: "react/jsx-no-target-blank",
        severity: 2,
        message:
          'Using target="_blank" without rel="noreferrer" (which implies rel="noopener") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations',
        messageId: "noTargetBlankWithoutNoreferrer",
      });
      const expectedLatest = {
        "some/path/file-a.jsx": {
          "react/jsx-no-target-blank": {
            warning: 0,
            error: 3,
          },
        },
        "another/path/file-b.js": {
          "@productplan/custom-rules/throw-or-log": {
            warning: 2,
            error: 0,
          },
        },
      };
      const expectedMessages = [
        "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
        "some/path/file-a.jsx",
        "react/jsx-no-target-blank",
        "--> error: 3 (previously: 2)",
        "🔥",
        "These latest eslint results have been saved to eslint-ratchet-temp.json. \nIf these results were expected then use them to replace the content of eslint-ratchet.json and check it in.",
      ];

      setupMocks();
      expect(() => formatter(newResults, null, logger, true)).toThrow();
      expect(messages).toEqual(expect.arrayContaining(expectedMessages));

      const newValues = JSON.parse(
        fs.readFileSync("./eslint-ratchet-temp.json"),
      );
      expect(JSON.stringify(newValues)).toBe(JSON.stringify(expectedLatest));
      delete process.env.RATCHET_DEFAULT_EXIT_ZERO;
    });
  });
});

const writeFile = (relPath, content) => {
  const fullPath = path.join(tempDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
};

const setupMocks = (customFiles = {}) => {
  const defaults = {
    "eslint-ratchet.json": JSON.stringify(getMockThresholds()),
    "app/assets/javascripts/actions/notification-actions.js": "",
    "some/path/file-a.jsx": "",
    "another/path/file-b.js": "",
    "eslint-ratchet-temp.json": JSON.stringify({}),
    ...customFiles,
  };
  for (const [file, content] of Object.entries(defaults)) {
    writeFile(file, content);
  }
};

const setupMissingFileMocks = () => {
  writeFile("eslint-ratchet.json", JSON.stringify(getMockThresholds()));
  writeFile("app/assets/javascripts/actions/notification-actions.js", "");
  writeFile("eslint-ratchet-temp.json", JSON.stringify({}));
  // some/path/file-a.jsx and another/path/file-b.js intentionally not created
};

const getMockResults = () => [
  {
    filePath: "app/assets/javascripts/actions/notification-actions.js",
    messages: [],
    errorCount: 0,
    warningCount: 0,
  },
  {
    filePath: "some/path/file-a.jsx",
    messages: [
      {
        ruleId: "react/jsx-no-target-blank",
        severity: 2,
      },
      {
        ruleId: "react/jsx-no-target-blank",
        severity: 2,
      },
    ],
    errorCount: 2,
    warningCount: 0,
  },
  {
    filePath: "another/path/file-b.js",
    messages: [
      {
        ruleId: "@productplan/custom-rules/throw-or-log",
        severity: 1,
      },
      {
        ruleId: "@productplan/custom-rules/throw-or-log",
        severity: 1,
      },
    ],
    errorCount: 0,
    warningCount: 2,
  },
];

const getMockThresholds = () => ({
  "some/path/file-a.jsx": {
    "react/jsx-no-target-blank": {
      warning: 0,
      error: 2,
    },
  },
  "another/path/file-b.js": {
    "@productplan/custom-rules/throw-or-log": {
      warning: 2,
      error: 0,
    },
  },
});
