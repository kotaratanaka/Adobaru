import { GoogleGenAI } from "@google/genai";

// Initialize Gemini API
// Note: In a real production app, you might want to proxy this through a backend
// to keep the key secure, but for this preview/prototype, client-side is acceptable
// as per the instructions for paid keys or environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface Point {
  x: number;
  y: number;
}

export interface RoomAnalysisResult {
  corners: Point[];
  scaleReference?: {
    start: Point;
    end: Point;
    lengthInMeters: number;
  };
}

/**
 * Analyzes a floor plan image to detect the room boundaries.
 * Returns a list of normalized coordinates (0-1000) for the room polygon.
 */
export async function analyzeFloorPlan(imageBase64: string): Promise<RoomAnalysisResult> {
  const model = 'gemini-3.1-pro-preview'; // Using the requested high-reasoning model

  const prompt = `
    Analyze this floor plan image.
    I need to identify the main usable room boundary (the polygon defining the floor space where furniture can be placed).
    Ignore walls, pillars, and other obstructions if possible, or outline the main open area.
    
    Return a JSON object with the following structure:
    {
      "corners": [
        {"x": 10, "y": 10},
        {"x": 990, "y": 10},
        {"x": 990, "y": 990},
        {"x": 10, "y": 990}
      ]
    }
    
    The coordinates should be normalized to a 0-1000 scale (where 0,0 is top-left and 1000,1000 is bottom-right).
    Return ONLY the JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg", // Assuming JPEG for simplicity, but should match input
              data: imageBase64.split(',')[1] // Remove data URL prefix
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const result = JSON.parse(text);
    return result;
  } catch (error) {
    console.error("Error analyzing floor plan:", error);
    throw error;
  }
}
