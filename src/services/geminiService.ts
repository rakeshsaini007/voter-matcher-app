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
  // First, try exact matching to reduce the load on Gemini
  const matchedLoksabha = [...loksabha];
  const unmatchedIndices: number[] = [];

  matchedLoksabha.forEach((record, index) => {
    // Simple normalization: remove spaces and common suffixes
    const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    
    const match = vidhansabha.find(v => 
      normalize(v.voterName) === normalize(record.voterName) &&
      normalize(v.relativeName) === normalize(record.relativeName) &&
      normalize(v.houseNo) === normalize(record.houseNo)
    );

    if (match) {
      record.epicNo = match.epicNo;
    } else {
      unmatchedIndices.push(index);
    }
  });

  if (unmatchedIndices.length === 0) return matchedLoksabha;

  // For unmatched records, use Gemini for fuzzy matching
  // We'll process them in batches to avoid token limits
  const batchSize = 20;
  for (let i = 0; i < unmatchedIndices.length; i += batchSize) {
    const currentBatchIndices = unmatchedIndices.slice(i, i + batchSize);
    const currentLoksabhaBatch = currentBatchIndices.map(idx => matchedLoksabha[idx]);
    
    // Provide relevant context from Vidhansabha (only potential matches to save tokens)
    // For each record in batch, find potential candidates in Vidhansabha
    const candidates = new Set<VoterRecord>();
    currentLoksabhaBatch.forEach(record => {
      vidhansabha.forEach(v => {
        // If house number matches or name starts with same character
        if (v.houseNo === record.houseNo || v.voterName[0] === record.voterName[0]) {
          candidates.add(v);
        }
      });
    });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a voter list reconciliation expert. Match the EPIC numbers from the Vidhansabha list to the Loksabha list. 
        
        CRITICAL RULES:
        1. Names may have spelling variations (e.g., 'हरिकिशन' vs 'हरकृष्ण').
        2. Names may have honorifics or suffixes like 'सिंह', 'कौर', 'देवी', 'कुमारी', 'राम', 'लाल' which might be present in one list but not the other.
        3. Relatives' names (Father/Husband) and House Numbers should be used to confirm matches.
        4. Only return a match if you are highly confident.
        
        Loksabha List (to fill):
        ${JSON.stringify(currentLoksabhaBatch.map(r => ({ id: r.id, name: r.voterName, relative: r.relativeName, house: r.houseNo })))}
        
        Vidhansabha List (reference):
        ${JSON.stringify(Array.from(candidates).map(r => ({ epic: r.epicNo, name: r.voterName, relative: r.relativeName, house: r.houseNo })))}
        
        Return a JSON array of objects with 'id' from Loksabha and 'epic' from Vidhansabha. If no match found, use null for epic.`,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
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
