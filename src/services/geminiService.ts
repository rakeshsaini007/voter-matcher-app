import { GoogleGenAI, Type } from "@google/genai";

export interface VoterRecord {
  id: string;
  svnNo?: string;
  houseNo: string;
  voterName: string;
  relativeName: string;
  epicNo: string;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function matchEpicNumbers(loksabha: VoterRecord[], vidhansabha: VoterRecord[]): Promise<VoterRecord[]> {
  const matchedLoksabha = [...loksabha];
  const unmatchedIndices: number[] = [];

  // Helper for normalization
  const norm = (s: string) => String(s || "").replace(/\s+/g, "").toLowerCase();

  matchedLoksabha.forEach((record, index) => {
    const name = record.voterName.trim();
    const relative = record.relativeName.trim();

    let found = false;
    for (const v of vidhansabha) {
      const vsName = v.voterName.trim();
      const vsRelative = v.relativeName.trim();

      // Exact Match (Name + Relative)
      if (vsName === name && vsRelative === relative) {
        record.epicNo = v.epicNo;
        found = true;
        break;
      }

      // Soft Match (Ignore spaces and common suffixes)
      if (norm(vsName).startsWith(norm(name).substring(0, 4))) {
        const n1 = norm(vsName);
        const n2 = norm(name);
        const r1 = norm(vsRelative);
        const r2 = norm(relative);
        
        if ((n1.includes(n2) || n2.includes(n1)) && (r1.includes(r2) || r2.includes(r1))) {
           record.epicNo = v.epicNo;
           found = true;
           break;
        }
      }
    }

    if (!found) {
      unmatchedIndices.push(index);
    }
  });

  if (unmatchedIndices.length === 0) return matchedLoksabha;

  // For unmatched records, use Gemini for fuzzy matching
  const batchSize = 20;
  for (let i = 0; i < unmatchedIndices.length; i += batchSize) {
    const currentBatchIndices = unmatchedIndices.slice(i, i + batchSize);
    const currentLoksabhaBatch = currentBatchIndices.map(idx => matchedLoksabha[idx]);
    
    // Provide relevant context from Vidhansabha
    const candidates = new Set<VoterRecord>();
    currentLoksabhaBatch.forEach(record => {
      vidhansabha.forEach(v => {
        if (norm(v.voterName)[0] === norm(record.voterName)[0]) {
          candidates.add(v);
        }
      });
    });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a voter list reconciliation expert. Match the EPIC numbers from the Vidhansabha list to the Loksabha list. 
        
        HINDI NAME MATCHING RULES:
        1. Spelling variations are common: 'गगनदीप' vs 'गगन दीप', 'हरिकिशन' vs 'हरकृष्ण'.
        2. Honorifics/Suffixes can be missing: 'सिंह', 'कौर', 'देवी', 'कुमारी', 'राम', 'लाल'.
        3. Use Relative Name to confirm.
        4. IGNORE House Numbers entirely.
        5. If names and relatives are phonetically similar, it is likely a match.
        
        Loksabha List (to fill):
        ${JSON.stringify(currentLoksabhaBatch.map(r => ({ id: r.id, name: r.voterName, relative: r.relativeName })))}
        
        Vidhansabha List (reference):
        ${JSON.stringify(Array.from(candidates).map(r => ({ epic: r.epicNo, name: r.voterName, relative: r.relativeName })))}
        
        Return a JSON array: [{"id": string, "epic": string|null}]`,
        config: {
          responseMimeType: "application/json",
          temperature: 0,
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                epic: { type: Type.STRING, nullable: true }
              },
              required: ["id", "epic"]
            }
          }
        }
      });

      const results = JSON.parse(response.text || "[]");
      results.forEach((res: { id: string, epic: string | null }) => {
        if (res.epic) {
          const record = matchedLoksabha.find(r => r.id === res.id);
          if (record) record.epicNo = res.epic;
        }
      });
    } catch (error) {
      console.error("Error in Gemini matching batch:", error);
    }
  }

  return matchedLoksabha;
}
