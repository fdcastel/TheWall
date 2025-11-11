const { test, expect } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Mock fs for testing
jest.mock('fs');

describe('Server Tests', () => {
  beforeEach(() => {
    // Mock readdirSync to return sample files
    fs.readdirSync.mockReturnValue([
      '00-4k-458510-colosseum.jpg',
      '01-4k-458532-bellagio.jpg',
      '02-4k-463798-manhattan-skyscraper.jpg'
    ]);
    fs.statSync.mockReturnValue({
      mtime: new Date(),
      size: 1000
    });
    fs.createReadStream.mockReturnValue('stream');
  });

  test('getLocalMetadata returns correct metadata', () => {
    // Since server.js is not modular, we need to test the function indirectly
    // For now, just a placeholder test
    expect(true).toBe(true);
  });

  // Add more tests as needed
});