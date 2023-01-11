# eslint-formatter-ratchet

[![npm version](https://badge.fury.io/js/eslint-formatter-ratchet.svg)](https://badge.fury.io/js/eslint-formatter-ratchet) ![NPM](https://img.shields.io/npm/l/eslint-formatter-ratchet)

[![Maintainability](https://api.codeclimate.com/v1/badges/42b2cb4eb530a867e3dc/maintainability)](https://codeclimate.com/github/ProductPlan/eslint-formatter-ratchet/maintainability) [![Test Coverage](https://api.codeclimate.com/v1/badges/42b2cb4eb530a867e3dc/test_coverage)](https://codeclimate.com/github/ProductPlan/eslint-formatter-ratchet/test_coverage)

> Ratcheting applied to [ESLint](https://eslint.org) results so new issues don't creep in.

## Features

- Creates a threshold for eslint results
  - Throws an error when the threshold is exceeded
  - Updates the threshold when it improves
- Stylized messages about result changes
- Command-click a filename header to reveal it in your editor. _(if your terminal supports it)_

## TL;DR

This formatter uses the results from eslint to prevent new violations from being added - regardless of error level.

## Install

| NPM                                       | Yarn                                   |
| ----------------------------------------- | -------------------------------------- |
| `npm install -D eslint-formatter-ratchet` | `yarn add -D eslint-formatter-ratchet` |

## How to use

When you run ESLint specify `eslint-formatter-ratchet` as the formatter:

```
$ eslint -f ratchet
```

You can also hook it up to other packages like `lint-staged` to constantly ratchet as you commit:

```json
// package.json
"lint-staged": {
    "**/*.{js,jsx}": [
        "eslint --fix",
        "eslint -f ratchet",
        "git add ./eslint-ratchet.json",
        "git add"
    ]
}
```

### Generated files

Two files are created while processing results:

- `eslint-ratchet.json` = used as the threshold and should be checked in
- `eslint-ratchet-temp.json` = used to store the latest results before comparison and should be added to your `.gitignore`

---

# The underlying idea

> How can we, without stopping forward momentum, incrementally improve our codebase?

We usually approach this situation in a few ways:

- we make sure to validate and document the changes ahead of time
- we make an announcement & provide some basic training to our teams
- we add some form of linting so that we all remain informed about our standards

Overall these are great steps to take - but they still fall short in a few keys places:

- lots of patterns can be hard to keep straight - especially if they change multiple times in a short period
- as new members join a project the list of what they need to know continues to grow
- linting tools don't always allow for the type of enforcement we want

In this case, we're aiming to solve this last point - specifically for `eslint`. As written eslint provides us with some great functionality:

- lots of well maintained standards-based rules
- lots of community-contributed rules
- customization of error levels per rule - namely `warning` vs `error`
- custom overrides to tweak rules as needed

The one thing missing here though is a mechanism to ensure that new rule violations, regardless of error level, aren't introduced. For example, we may wish to introduce a new linting rule as an `error` but find that we have 100s of files where it already exists. Because we can't reasonably update all of those places at once (usually) we set the level to `warn` and attempt to fix the existing issues before new cases are added. Regardless of whether we can pull this off, it is scope creep and more often than not we are left with rules in a `warn` state that never become `error` s as intended.

# Introducing eslint-formatter-ratchet

That's where `eslint-formatter-ratchet` comes in, or at least where it attempts to help. In a nutshell, it groups and saves previous eslint results so that they can be checked in and used as thresholds in subsequent eslint runs. This allows it to check for differences and either throw an error when counts increase or update the checked-in output when they decrease - effectually ratcheting the threshold. Because of the way it groups counts, it also ensures that improvements in one rule/file are not overshadowed by regressions in others. (For more details see [grouping])

While this doesn't mean that we'll be able to clean up those 100s of files it does guarantee that we won't add new cases accidentally. Additionally, as we work through the existing counts the threshold will continue to get lower without us needing to take any extra action.

## Grouping issues

To make sure that improvements in one area do not occur at the expense of another violations are stored in a file/rule/violation pattern. Take for example `app/some/path/a-file.js`:

```json
"app/some/path/a-file.js": {
    "react/prop-types": {
        "warning": 0,
        "error": 1
    },
    "react/jsx-no-target-blank": {
        "warning": 1,
        "error": 0
    }
}
```

In this case, we have two violations in the same file. When either of these improves, in this case, goes from `1 -> 0` the output will be updated and checked in automatically. If on the other hand one gets better and the other worse we throw an error and the output remains unchanged.

## Cases where violations _should_ get worse

In cases where ratcheting is already in place but we want to add new linting rules, or even adjust existing settings, it is expected that the ratcheting process will throw an error.

In any situation where new changes are detected that violate the threshold, an error is thrown and details about which issues got worse are included. Since we expect new violations to occur though we follow the details in the message - copy the contents of `eslint-ratchet-latest.json` and use them to replace `eslint-ratchet.json` and check the changes in.

# Tips

In iTerm, <kbd>Command</kbd>-click the filename header to open the file in your editor.

In [terminals with support for hyperlinks](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda#supporting-apps), <kbd>Command</kbd>-click the rule ID to open its docs.

# Contributing

First off, thank you for considering contributing. We are always happy to accept contributions and will do our best to ensure they receive the appropriate feedback.

Things to know:

- Commits are required to follow the [Conventional Commits Specification](https://www.conventionalcommits.org/en/v1.0.0/).
- There is no planned/automated cadence for releases. Because of this once changes are merged they will be manually published, at least for the time being.

## Making changes/improvements

To contribute changes:

- Fork the repo
- Create your feature branch (git checkout -b my-new-feature)
- Make, test, and commit your changes (git commit -am 'feat: Add some feature')
- Push to the branch (git push origin my-new-feature)
- Create a new Pull Request

Note: only changes accompanied by tests will be considered for merge.

## Reporting issues

If you encounter any issue please feel free to open a new ticket and report it.
