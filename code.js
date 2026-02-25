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

  const unmatched = [];

  // Helper for normalization
  const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();

  // 1. Exact & Soft Matching
  for (let i = 1; i < lsData.length; i++) {
    const lsRow = lsData[i];
    const name = String(lsRow[lsNameIdx]).trim();
    const relative = String(lsRow[lsRelativeIdx]).trim();
    
    if (!name) continue;

    let found = false;
    for (let j = 1; j < vsData.length; j++) {
      const vsRow = vsData[j];
      const vsName = String(vsRow[vsNameIdx]).trim();
      const vsRelative = String(vsRow[vsRelativeIdx]).trim();

      // Exact Match (Name + Relative)
      if (vsName === name && vsRelative === relative) {
        lsData[i][epicColIdx] = vsRow[vsEpicIdx];
        found = true;
        break;
      }
      
      // Soft Match (Ignore spaces and common suffixes)
      if (norm(vsName).startsWith(norm(name).substring(0, 4))) {
        const n1 = norm(vsName);
        const n2 = norm(name);
        const r1 = norm(vsRelative);
        const r2 = norm(relative);
        
        // Match if names are similar AND relatives are similar
        if ((n1.includes(n2) || n2.includes(n1)) && (r1.includes(r2) || r2.includes(r1))) {
           lsData[i][epicColIdx] = vsRow[vsEpicIdx];
           found = true;
           break;
        }
      }
    }
    if (!found) unmatched.push({ rowIndex: i + 1, name, relative });
  }

  // Update sheet with initial matches
  loksabhaSheet.getDataRange().setValues(lsData);

  // 2. Advanced Fuzzy Matching with Gemini
  if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10 && unmatched.length > 0) {
    const batchSize = 15;
    const vsReference = vsData.slice(1).map(r => ({
      epic: r[vsEpicIdx],
      name: r[vsNameIdx],
      relative: r[vsRelativeIdx]
    }));

    for (let i = 0; i < unmatched.length; i += batchSize) {
      const batch = unmatched.slice(i, i + batchSize);
      
      // Filter reference to only relevant candidates
      const relevantRef = vsReference.filter(v => 
        batch.some(b => norm(v.name)[0] === norm(b.name)[0])
      );

      try {
        const matchedBatch = callGeminiFuzzyMatch(batch, relevantRef);
        if (matchedBatch && matchedBatch.length > 0) {
          matchedBatch.forEach(m => {
            if (m.epic) {
              loksabhaSheet.getRange(m.rowIndex, epicColIdx + 1).setValue(m.epic);
            }
          });
        }
      } catch (e) {
        console.error("Batch Error: " + e);
      }
    }
  }

  return { success: true, matchedCount: lsData.length - 1 - unmatched.length, remainingUnmatched: unmatched.length };
}

function callGeminiFuzzyMatch(batch, reference) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = `You are a voter list reconciliation expert. Match the EPIC numbers from the Reference List to the Target List.
  
  HINDI NAME MATCHING RULES:
  1. Spelling variations are common: 'गगनदीप' vs 'गगन दीप', 'हरिकिशन' vs 'हरकृष्ण'.
  2. Honorifics/Suffixes can be missing: 'सिंह', 'कौर', 'देवी', 'कुमारी', 'राम', 'लाल'.
  3. Use Relative Name to confirm.
  4. IGNORE House Numbers entirely.
  5. If names and relatives are phonetically similar, it is likely a match.
  
  Target List: ${JSON.stringify(batch)}
  Reference List: ${JSON.stringify(reference)}
  
  Return ONLY a JSON array: [{"rowIndex": number, "epic": string|null}]`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { 
      responseMimeType: "application/json",
      temperature: 0
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseText = response.getContentText();
  const json = JSON.parse(responseText);
  
  try {
    let text = json.candidates[0].content.parts[0].text;
    // Clean up markdown if present
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(text);
  } catch (e) {
    console.error("Gemini Error: " + responseText);
    return [];
  }
}
