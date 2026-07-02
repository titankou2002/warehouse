const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.SHEET_ID || '1QR6xLZrdSUzhkCNwBhE5EUYpdv8GqkESfj3ELzNf59s';
const SCOPES   = ['https://www.googleapis.com/auth/spreadsheets'];

let _sheets = null;

async function getSheetsClient() {
  if (_sheets) return _sheets;

  const credPath = path.join(__dirname, '../../service-account.json');
  const auth = new google.auth.GoogleAuth({ keyFile: credPath, scopes: SCOPES });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

module.exports = { getSheetsClient, SHEET_ID };
