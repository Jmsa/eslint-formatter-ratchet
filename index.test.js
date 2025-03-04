const fs = require("fs");
const chai = require("chai");
const chaiAsPromised = require("chai-as-promised").default;
const mock = require("mock-fs");
const formatter = require("./index");
const sinon = require("sinon");
const path = require("path");
const eslint = require("eslint");

const expect = chai.expect;
chai.use(chaiAsPromised);
let messages = [];
let stubLoadFormatter;
const logger = {
  log: (m) => messages.push(m),
  group: (m) => messages.push(m),
  groupEnd: () => {},
};

describe("eslint-ratchet", () => {
  beforeEach("clear messages", function () {
    messages = [];
  });
  beforeEach("mock eslint dynamic formatter loader", () => {
    stubLoadFormatter = sinon
      .stub(eslint.ESLint.prototype, "loadFormatter")
      .returns(
        Promise.resolve({ format: () => "Stub inner formatted output" }),
      );
  });
  afterEach("undo mocks", function () {
    restoreMocks();
    stubLoadFormatter.restore();
  });

  it("doesn't throw errors or log messages when there are no changes", async function () {
    setupMocks();
    await formatter(getMockResults(), null, logger);
    expect(messages.length).to.equal(1);
  });

  describe("when issues increase", function () {
    let newResults;

    before("Mock new results with more issues than the base mock", function () {
      newResults = getMockResults();
      newResults[1].errorCount = 3;
      newResults[1].messages.push({
        ruleId: "react/jsx-no-target-blank",
        severity: 2,
        message:
          'Using target="_blank" without rel="noreferrer" (which implies rel="noopener") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations',
        messageId: "noTargetBlankWithoutNoreferrer",
      });
    });

    it("throws an error", async function () {
      setupMocks();
      return expect(
        formatter(newResults, null, logger),
      ).to.eventually.be.rejectedWith(Error);
    });
    it("logs messages", async function () {
      setupMocks();
      const expectedMessages = [
        "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
        "some/path/file-a.jsx",
        "react/jsx-no-target-blank",
        "--> error: 3 (previously: 2)",
        "🔥",
        "These latest eslint results have been saved to eslint-ratchet-temp.json. \nIf these results were expected then use them to replace the content of eslint-ratchet.json and check it in.",
      ];
      try {
        await formatter(newResults, null, logger);
      } catch (_) {}

      expect(messages).to.include.members(expectedMessages);
    });

    it("writes a new eslint-ratchet-temp.json", async function () {
      setupMocks();
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
      try {
        await formatter(newResults, null, logger);
      } catch (_) {}
      const newValues = JSON.parse(
        fs.readFileSync("./eslint-ratchet-temp.json"),
      );
      expect(JSON.stringify(newValues)).to.equal(
        JSON.stringify(expectedLatest),
      );
    });
  });

  describe("when issues decrease", function () {
    let newResults;

    before("Mock reduced results", function () {
      newResults = getMockResults();
      newResults[1].errorCount = 0;
      newResults[1].messages = [];
    });

    it("logs messages", async function () {
      const expectedMessages = [
        "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
        "some/path/file-a.jsx",
        "react/jsx-no-target-blank",
        "--> error: 0 (previously: 2)",
      ];

      setupMocks();

      await formatter(newResults, null, logger);
      expect(messages).to.include.members(expectedMessages);
    });

    it("updates thresholds", async function () {
      const expectedLatest = {
        "another/path/file-b.js": {
          "@productplan/custom-rules/throw-or-log": { warning: 2, error: 0 },
        },
      };

      setupMocks();

      await formatter(newResults, null, logger);
      const newValues = JSON.parse(fs.readFileSync("./eslint-ratchet.json"));
      expect(JSON.stringify(newValues)).to.equal(
        JSON.stringify(expectedLatest),
      );
    });
  });

  describe("when files are removed", function () {
    let newResults;

    before("remove a file from results", function () {
      newResults = getMockResults().filter((v, i) => i !== 1);
    });

    it("logs messages", async function () {
      const expectedMessages = [
        "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
        "some/path/file-a.jsx",
        "react/jsx-no-target-blank",
        "--> error: 0 (previously: 2)",
      ];
      setupMissingFileMocks();

      await formatter(newResults, null, logger);

      expect(messages).to.include.members(expectedMessages);
    });

    it("updates thresholds", async function () {
      const expectedLatest = {
        "another/path/file-b.js": {
          "@productplan/custom-rules/throw-or-log": { warning: 2, error: 0 },
        },
      };

      setupMissingFileMocks();
      await formatter(newResults, null, logger);
      const newValues = JSON.parse(fs.readFileSync("./eslint-ratchet.json"));
      expect(JSON.stringify(newValues)).to.equal(
        JSON.stringify(expectedLatest),
      );
    });
  });

  describe("when there are files which weren't linted", function () {

    it("doesn't update thresholds for those files", async function () {
      const newResults = getMockResults().filter((v, i) => i !== 1);
      const expectedLatest = getMockThresholds();

      setupMocks({ "some/path/file-a.jsx": "" });
      await formatter(newResults, null, logger);
      const newValues = JSON.parse(fs.readFileSync("./eslint-ratchet.json"));
      expect(JSON.stringify(newValues)).to.equal(
        JSON.stringify(expectedLatest),
      );
    });
  });

  describe("when no previous results are found and there are issues", function () {
    it("throws an error", async function () {
      const newResults = getMockResults();
      setupMocks();
      fs.unlinkSync("./eslint-ratchet.json");
      return expect(
        formatter(newResults, null, logger),
      ).to.eventually.be.rejectedWith(Error);
    });
    it("considers all issues as new", async function () {
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
      try {
        await formatter(newResults, null, logger);
      } catch (_) {
        /* */
      }
      expect(messages).to.include.members(expectedMessages);
    });
  });

  it("logs appropriately when there are no more issues", async function () {
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
      "app/assets/javascripts/actions/notification-actions.js": mock.file({
        content: "",
      }),
      "eslint-ratchet.json": mock.file({
        content: JSON.stringify({
          "app/assets/javascripts/actions/notification-actions.js": {
            "react/jsx-no-target-blank": {
              error: 2,
            },
          },
        }),
      }),
    });
    await formatter(newResults, null, logger);
    expect(messages).to.include.members(expectedMessages);
  });

  describe("option: RATCHET_DEFAULT_EXIT_ZERO", async function () {
    it("disabled: does not log", async function () {
      setupMocks({ "some/path/file-a.jsx": "", "another/path/file-b.js": "" });
      await formatter(getMockResults(), null, logger);
      expect(messages).to.not.contain(
        "eslint-ratchet: causing process to exit 0",
      );
    });

    describe("enabled:", function () {
      before("create env var", function () {
        process.env.RATCHET_DEFAULT_EXIT_ZERO = "true";
      });
      after("remove env var", function () {
        delete process.env.RATCHET_DEFAULT_EXIT_ZERO;
      });

      describe("when issues are unchanged", function () {
        it("exits with code 0 and logs", async function () {
          let exitCode = null;
          sinon.stub(process, "exit").callsFake((event) => (exitCode = event));
          setupMocks({
            "some/path/file-a.jsx": "",
            "another/path/file-b.js": "",
          });
          await formatter(getMockResults(), null, logger);
          expect(messages).to.contain(
            "eslint-ratchet: causing process to exit 0",
          );
          expect(exitCode).to.equal(0);
          process.exit.restore();
        });
      });
      describe("when issues increase", function () {
        it("throws an error", async function () {
          const newResults = getMockResults();
          newResults[1].errorCount = 3;
          newResults[1].messages.push({
            ruleId: "react/jsx-no-target-blank",
            severity: 2,
            message:
              'Using target="_blank" without rel="noreferrer" (which implies rel="noopener") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations',
            messageId: "noTargetBlankWithoutNoreferrer",
          });

          setupMocks();
          return expect(
            formatter(newResults, null, logger, true),
          ).to.eventually.be.rejectedWith(Error);
        });

        it("logs messages", async function () {
          const newResults = getMockResults();
          newResults[1].errorCount = 3;
          newResults[1].messages.push({
            ruleId: "react/jsx-no-target-blank",
            severity: 2,
            message:
              'Using target="_blank" without rel="noreferrer" (which implies rel="noopener") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations',
            messageId: "noTargetBlankWithoutNoreferrer",
          });
          const expectedMessages = [
            "⚠️  eslint-ratchet: Changes to eslint results detected!!!",
            "some/path/file-a.jsx",
            "react/jsx-no-target-blank",
            "--> error: 3 (previously: 2)",
            "🔥",
            "These latest eslint results have been saved to eslint-ratchet-temp.json. \nIf these results were expected then use them to replace the content of eslint-ratchet.json and check it in.",
          ];

          setupMocks();
          try {
            await formatter(newResults, null, logger, true);
          } catch (_) {
            /* */
          }
          expect(messages).to.include.members(expectedMessages);
        });

        it("writes to eslint-ratchet-temp.json", async function () {
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

          setupMocks();
          try {
            await formatter(newResults, null, logger, true);
          } catch (_) {
            /* */
          }

          const newValues = JSON.parse(
            fs.readFileSync("./eslint-ratchet-temp.json"),
          );
          expect(JSON.stringify(newValues)).to.equal(
            JSON.stringify(expectedLatest),
          );
        });
      });
    });
  });

  describe("option: RATCHET_USE_FORMATTER", async function () {
    it("not provided: loads default formatter", async function () {
      setupMocks();
      await formatter(getMockResults(), null, logger);

      expect(stubLoadFormatter.calledWith(undefined)).to.equal(true);
    });

    describe("when var is set to:", function () {
      beforeEach(
        "mock filesystem - may timeout on slow filesystems",
        function () {
          this.timeout(100000);
          setupModuleMocks();
        },
      );
      beforeEach("unmock eslint", function () {
        stubLoadFormatter.restore();
      });

      after("remove env var", function () {
        delete process.env.RATCHET_USE_FORMATTER;
      });

      describe("'stylish'", function () {
        it("loads the 'stylish' formatter", async function () {
          process.env.RATCHET_USE_FORMATTER = "stylish";
          await formatter(getMockResults(), null, logger);
          expect(messages).to.contain(
            '\nanother/path/file-b.js\n  0:0  warning    @productplan/custom-rules/throw-or-log\n  0:0  warning    @productplan/custom-rules/throw-or-log\n\nsome/path/file-a.jsx\n  0:0  error  Using target="_blank" without rel="noreferrer" (which implies rel="noopener") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations  react/jsx-no-target-blank\n  0:0  error  Using target="_blank" without rel="noreferrer" (which implies rel="noopener") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations  react/jsx-no-target-blank\n\n✖ 4 problems (2 errors, 2 warnings)\n',
          );
        });
      });
      describe("'json'", function () {
        it("loads the 'json' formatter", async function () {
          process.env.RATCHET_USE_FORMATTER = "json";
          await formatter(getMockResults(), null, logger);
          expect(messages).to.contain(
            '[{"filePath":"another/path/file-b.js","messages":[{"ruleId":"@productplan/custom-rules/throw-or-log","message":"","severity":1},{"ruleId":"@productplan/custom-rules/throw-or-log","message":"","severity":1}],"errorCount":0,"warningCount":2},{"filePath":"app/assets/javascripts/actions/notification-actions.js","messages":[],"errorCount":0,"warningCount":0},{"filePath":"some/path/file-a.jsx","messages":[{"ruleId":"react/jsx-no-target-blank","message":"Using target=\\"_blank\\" without rel=\\"noreferrer\\" (which implies rel=\\"noopener\\") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations","severity":2},{"ruleId":"react/jsx-no-target-blank","message":"Using target=\\"_blank\\" without rel=\\"noreferrer\\" (which implies rel=\\"noopener\\") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations","severity":2}],"errorCount":2,"warningCount":0}]',
          );
        });
      });
    });
  });
});

const setupMocks = (customFiles = {}) => {
  mock({
    "eslint-ratchet.json": mock.file({
      content: JSON.stringify(getMockThresholds()),
    }),
    "app/assets/javascripts/actions/notification-actions.js": mock.file({}),
    "some/path/file-a.jsx": mock.file({}),
    "another/path/file-b.js": mock.file({}),
    "eslint-ratchet-temp.json": JSON.stringify({}),
    ...customFiles,
    //node_modules: mock.load(path.resolve(__dirname, "./node_modules")),
  });
};

const setupModuleMocks = () => {
  mock({
    "eslint-ratchet.json": mock.file({
      content: JSON.stringify(getMockThresholds()),
    }),
    "app/assets/javascripts/actions/notification-actions.js": mock.file({}),
    "some/path/file-a.jsx": mock.file({}),
    "another/path/file-b.js": mock.file({}),
    "eslint-ratchet-temp.json": JSON.stringify({}),
    node_modules: mock.load(path.resolve(__dirname, "./node_modules")),
  });
};

const setupMissingFileMocks = () => {
  mock({
    "eslint-ratchet.json": mock.file({
      content: JSON.stringify(getMockThresholds()),
    }),
    "app/assets/javascripts/actions/notification-actions.js": mock.file({}),
    "eslint-ratchet-temp.json": JSON.stringify({}),
  });
};

const restoreMocks = () => {
  messages = [];
  mock.restore();
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
        message:
          'Using target="_blank" without rel="noreferrer" (which implies rel="noopener") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations',

        severity: 2,
      },
      {
        ruleId: "react/jsx-no-target-blank",
        message:
          'Using target="_blank" without rel="noreferrer" (which implies rel="noopener") is a security risk in older browsers: see https://mathiasbynens.github.io/rel-noopener/#recommendations',

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
        message: "",
        severity: 1,
      },
      {
        ruleId: "@productplan/custom-rules/throw-or-log",
        message: "",
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
