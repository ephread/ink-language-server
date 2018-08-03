import { IConnectionLogger } from '../../types/types';

const showErrorMessage = jest.fn();
const showWarningMessage = jest.fn();
const showInformationMessage = jest.fn();
const reportServerError = jest.fn();

const consoleError = jest.fn();
const consoleWarn = jest.fn();
const consoleInfo = jest.fn();
const consoleLog = jest.fn();

const mockedLogger: {
  logger: IConnectionLogger
  mocks: {
    showErrorMessage: jest.Mock<{}>;
    showWarningMessage: jest.Mock<{}>;
    showInformationMessage: jest.Mock<{}>;
    reportServerError: jest.Mock<{}>;

    consoleError: jest.Mock<{}>;
    consoleWarn: jest.Mock<{}>;
    consoleInfo: jest.Mock<{}>;
    consoleLog: jest.Mock<{}>;
  }
} = {
  logger: {
    console: {
      error: consoleError,
      warn: consoleWarn,
      info: consoleInfo,
      log: consoleLog
    },
    showErrorMessage,
    showWarningMessage,
    showInformationMessage,
    reportServerError
  },

  mocks: {
    showErrorMessage,
    showWarningMessage,
    showInformationMessage,
    reportServerError,

    consoleError,
    consoleWarn,
    consoleInfo,
    consoleLog
  }
};

export default mockedLogger;