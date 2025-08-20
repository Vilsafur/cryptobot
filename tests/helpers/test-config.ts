import { config } from '../../src/config';

config.dbPath = ':memory:'; // Use in-memory database for tests

export const nowSecs = () => 1755619200; // Override for test environment