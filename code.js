/**
 * Google Apps Script for Voter List EPIC Matcher
 * 
 * Instructions:
 * 1. Open your Google Sheet containing "loksabha" and "vidhansabha" sheets.
 * 2. Go to Extensions > Apps Script.
 * 3. Paste this code into the editor.
 * 4. Replace 'YOUR_GEMINI_API_KEY' with your actual API key.
 * 5. Deploy as a Web App (Execute as: Me, Access: Anyone).
 * 6. Copy the Deployment URL and paste it into the React app's GAS_DEPLOY_URL constant.
 */

const GEMINI_API_KEY = 'AIzaSyDMQGOWn26l5fVBmmoybURsfKh_TgrMBeg';

function doGet() {
  return HtmlService.createHtmlOutput("Voter Matcher API is running.");
}

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;

    if (action === 'sync_and_match') {
      return ContentService.createTextOutput(JSON.stringify(syncAndMatch())).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid action' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function syncAndMatch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const loksabhaSheet = ss.getSheetByName("loksabha");
  const vidhansabhaSheet = ss.getSheetByName("vidhansabha");

  if (!loksabhaSheet || !vidhansabhaSheet) {
    throw new Error("Sheets 'loksabha' or 'vidhansabha' not found.");
  }

  const lsData = loksabhaSheet.getDataRange().getValues();
  const vsData = vidhansabhaSheet.getDataRange().getValues();

  // Headers
  const lsHeaders = lsData[0];
  const vsHeaders = vsData[0];

  const epicColIdx = lsHeaders.indexOf("EPIC क्रमांक");
  const lsNameIdx = lsHeaders.indexOf("निर्वाचक का नाम");
  const lsRelativeIdx = lsHeaders.indexOf("पिता/पति/माता का नाम");
  const lsHouseIdx = lsHeaders.indexOf("मकान नं०");

  const vsEpicIdx = vsHeaders.indexOf("EPIC क्रमांक");
  const vsNameIdx = vsHeaders.indexOf("निर्वाचक का नाम");
  const vsRelativeIdx = vsHeaders.indexOf("पिता/पति/माता का नाम");
  const vsHouseIdx = vsHeaders.indexOf("मकान संख्या");

  if (epicColIdx === -1) throw new Error("Column 'EPIC क्रमांक' not found in loksabha sheet.");

  const results = [];
  const unmatched = [];

  // 1. Exact Matching
  for (let i = 1; i < lsData.length; i++) {
    const lsRow = lsData[i];
    const name = String(lsRow[lsNameIdx]).trim();
    const relative = String(lsRow[lsRelativeIdx]).trim();
    const house = String(lsRow[lsHouseIdx]).trim();

    let found = false;
    for (let j = 1; j < vsData.length; j++) {
      const vsRow = vsData[j];
      if (
        String(vsRow[vsNameIdx]).trim() === name &&
        String(vsRow[vsRelativeIdx]).trim() === relative &&
        String(vsRow[vsHouseIdx]).trim() === house
      ) {
        lsData[i][epicColIdx] = vsRow[vsEpicIdx];
        found = true;
        break;
      }
    }
    if (!found) unmatched.push({ rowIndex: i + 1, name, relative, house });
  }

  // 2. Fuzzy Matching with Gemini (if API key provided)
  if (GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY' && unmatched.length > 0) {
    // Process in small batches to avoid GAS timeout
    const batchSize = 10;
    const vsReference = vsData.slice(1).map(r => ({
      epic: r[vsEpicIdx],
      name: r[vsNameIdx],
      relative: r[vsRelativeIdx],
      house: r[vsHouseIdx]
    }));

    for (let i = 0; i < unmatched.length; i += batchSize) {
      const batch = unmatched.slice(i, i + batchSize);
      const matchedBatch = callGeminiFuzzyMatch(batch, vsReference);
      
      matchedBatch.forEach(m => {
        if (m.epic) {
          loksabhaSheet.getRange(m.rowIndex, epicColIdx + 1).setValue(m.epic);
        }
      });
    }
  } else {
    // Update exact matches back to sheet
    loksabhaSheet.getDataRange().setValues(lsData);
  }

  return { success: true, matchedCount: lsData.length - 1 - unmatched.length, remainingUnmatched: unmatched.length };
}

function callGeminiFuzzyMatch(batch, reference) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = `Match the EPIC numbers from the reference list to the target list. 
  Target List: ${JSON.stringify(batch)}
  Reference List: ${JSON.stringify(reference)}
  Return JSON array: [{"rowIndex": number, "epic": string|null}]`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  
  try {
    const text = json.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch (e) {
    console.error("Gemini Error: " + e);
    return [];
  }
}
