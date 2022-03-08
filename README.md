# Premise

> How can we, without stopping forward momentum, incrementally improve our codebase?

**Answer:** carefully...

But we usually approach this situation in a few ways:
 - we make sure to validate and document the changes ahead of time
 - we make an announcement & provide some basic training to our teams
 - we add some form of linting so that we all remain informed about our standards

Overall these are great steps to take - but they still fall short in a few keys places:
- lots of patterns can be hard to keep straight - especially if they improve multiple times in a short period
- as new members join the team the list of what they need to know continues to grow
- linting tools don't always allow for the type of enforcement we want

In this case, we're aiming to solve this last point - specifically for `eslint`. As written eslint provides us with some great functionality:
- lots of well maintained standards-based rules
- customization of error level per rule - namely `warning` vs `error`
- custom overrides to tweak rules as needed

	The one thing it is missing though is a mechanism to ensure that new rule violations, regardless of error level, aren't introduced. For example, we may wish to introduce a new linting rule as an `error`  but find that we have 100s of files where it already exists. Because we can't reasonably update all of those places at once (usually) we might change the level to `warn` and attempt to fix the existing issues before new cases are added. Regardless of whether we can pull this off, it is scope creep and more often than not we are left with rules in a `warn` state that never become `error` s as intended.

# Introducing eslint-ratchet

That's where `eslint-ratchet` comes in, or at least where it attempts to help. In a nutshell, it groups and saves previous eslint results so that they can be checked in and used as thresholds in subsequent eslint runs. This allows it to check for differences and either throw an error when violation counts increase or update the checked-in output when they decrease - effectually ratcheting the threshold. Because of the way it groups violations, it also ensures that improvements in one rule/file are not overshadowed by regressions in others. (For more details see [grouping])

While this doesn't mean that we'll be able to clean up those 100s of files it does guarantee that we won't add new cases accidentally. Additionally, as we work through the existing counts the threshold will continue to get lower without us needing to take any extra action.

## Using the formatter
`eslint-ratchet` works as a [formatter]() - allowing it access to the full results of the recent run. Because of this, it can be tacked onto any existing eslint script where you don't explicitly need another formatter's output.

`eslint -f ./eslint-ratchet.js`

It can also be used in combination with tools like [lint-staged]() - preventing commits from occurring that would increase the number of violations. For example, if you wish to lint/ratchet the staged changes before they are committed you could do something like this:

```json
"**/*.{js,jsx}": [
	"eslint --fix",
	"eslint -f ./eslint-ratchet.js",
	"git add ./eslint-ratchet.json",
	"git add"
],
```

## Checking in the expected output
Because we often work in repos with multiple contributors/teams we need to check in the output for this to truly be helpful. If you are running this for the first time you may wish to run `eslint -f ./eslint-ratchet.js` manually so that you can observe the output yourself and then check it in. If you are using something like `lint-staged` however it will automatically be added for you as violations improve.

**Note:** you will also likely want to add `eslint-ratchet-latest.json` to your `.gitignore`. That output is meant only as temporary storage for cases where you expect things to get worse - like adding new linting rules.

## More details

Looking a little deeper the following steps occur each time eslint finish running:
- `eslint-ratchet` takes the results from the latest run and groups them by file/rule/violation
- it then stores that grouped output in a file to be checked into the repo
- and uses the output to check for any differences
	- if there are none nothing happens
	- if there are more rule violations it throws an error
		- stores the new output in a separate file for review
		- warns about the exact changes
	- if there are fewer rule violations 
		- it prints a message
		- updates the output file
		- commits the changes to the output


### Grouping
To make sure that improvements in one area do not occur at the expense of another violations are stored in a file/rule/violation pattern. Take for example `app/javascript/components/score-drawer/score-drawer.jsx`: 

```json
"app/javascript/components/score-drawer/score-drawer.jsx": {
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

A ratcheting run with improvement then looks like this:

<img width="686" alt="ratchet - less issues" src="https://user-images.githubusercontent.com/1013263/157147214-7a0d6059-0746-4e93-87e8-9bee5b0707e1.png">

While a ratcheting run with new violations looks like this:

<img width="779" alt="ratchet - more issues" src="https://user-images.githubusercontent.com/1013263/157147241-c8a3ec26-df5d-4426-8e2d-902f6b9ccfb4.png">

### Cases where violations *should* get worse
In cases where ratcheting is already in place but we want to add new linting rules, or even adjust existing settings, it is expected that the ratcheting process will throw an error.

In any situation where new changes are detected that violate the threshold, an error is thrown and details about which issues got worse are included. Since we expect new violations to occur though we follow the details in the message - copy the contents of `eslint-ratchet-latest.json` and use them to replace `eslint-ratchet.json` and check the changes in. 
