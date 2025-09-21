// Jest setup file for global test configuration
global.console = {
  ...console,
  // Suppress console.log in tests unless needed
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};