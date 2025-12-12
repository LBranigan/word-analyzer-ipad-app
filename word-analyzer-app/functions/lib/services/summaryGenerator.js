"use strict";
/**
 * AI Summary Generator
 * Uses Google Gemini to generate personalized student feedback
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAISummary = generateAISummary;
const vertexai_1 = require("@google-cloud/vertexai");
// Initialize Vertex AI with the project
const vertexAI = new vertexai_1.VertexAI({
    project: 'word-analyzer-ipad-app',
    location: 'us-central1',
});
// Get Gemini 1.5 Flash model
const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-flash-001',
});
/**
 * Extract challenging words that were read correctly (strengths)
 * Focuses on longer words (6+ letters) that the student got right
 */
function extractStrengths(words) {
    const strengths = [];
    for (const word of words) {
        if (word.status === 'correct' && word.expected.length >= 6) {
            // Skip common/simple long words
            const skipWords = ['because', 'before', 'through', 'people', 'should', 'would', 'could'];
            if (!skipWords.includes(word.expected.toLowerCase())) {
                strengths.push(word.expected);
            }
        }
    }
    // Return up to 3 unique strengths, prioritizing longest words
    const unique = [...new Set(strengths)];
    unique.sort((a, b) => b.length - a.length);
    return unique.slice(0, 3);
}
/**
 * Extract words that were misread (struggles)
 * Returns expected word and what was actually spoken
 */
function extractStruggles(words) {
    const struggles = [];
    for (const word of words) {
        if ((word.status === 'misread' || word.status === 'substituted') && word.spoken) {
            struggles.push({
                expected: word.expected,
                spoken: word.spoken,
            });
        }
    }
    // Return up to 3 struggles
    return struggles.slice(0, 3);
}
/**
 * Extract the primary error pattern for the summary
 */
function extractPrimaryPattern(errorPatterns) {
    if (errorPatterns.length === 0) {
        return null;
    }
    // Get the most frequent pattern (already sorted by count)
    const primary = errorPatterns[0];
    // Skip hesitation/repetition as primary pattern if there's a more instructive pattern
    const skipAsPrimary = ['hesitation', 'repetition', 'self_correction', 'filler_word'];
    let selectedPattern = primary;
    if (skipAsPrimary.includes(primary.type) && errorPatterns.length > 1) {
        // Find first non-skipped pattern
        const alternative = errorPatterns.find(p => !skipAsPrimary.includes(p.type));
        if (alternative) {
            selectedPattern = alternative;
        }
    }
    return {
        type: selectedPattern.type,
        description: selectedPattern.pattern,
        examples: selectedPattern.examples.map(e => `${e.expected}→${e.spoken}`).slice(0, 2),
    };
}
/**
 * Build the system prompt for Gemini
 */
function buildSystemPrompt() {
    return `You are a friendly, encouraging reading coach for a 6th-7th grade student. Generate a spoken summary of their reading assessment.

STRUCTURE (follow exactly):
1. Start with specific praise - mention actual words they read correctly
2. Gently mention 1-2 specific words they struggled with (normalize mistakes, be encouraging)
3. If there's a pattern, identify it and give ONE simple, actionable practice tip
4. Add encouragement and a simple next step
5. End with a fun, rhyming or punny compliment using their name, including 1-2 youth slang terms (like "no cap", "lit", "fam", "fire", "slay", "W", "goated", "bussin")

RULES:
- Output ONLY plain text - no markdown, bullets, asterisks, or formatting
- Keep to 6-8 sentences total (~30-40 seconds when spoken)
- Be specific - use actual words from the data
- Sound natural when read aloud
- Keep the tone warm and encouraging, never critical
- If accuracy is high (90%+), focus more on praise
- If accuracy is lower, still lead with positives and be gentle about struggles
- The name compliment should be creative and fun - try rhymes, puns, or alliteration`;
}
/**
 * Build the user prompt with assessment data
 */
function buildUserPrompt(input) {
    let prompt = `Generate a spoken summary for this student's reading assessment:

STUDENT: ${input.studentName}

PERFORMANCE:
- Accuracy: ${input.metrics.accuracy}%
- Words read: ${input.metrics.totalWords}
- Correct: ${input.metrics.correctCount}
- Reading pace: ${input.metrics.wordsPerMinute} words per minute
- Overall grade: ${input.metrics.prosodyGrade}
- Hesitations: ${input.metrics.hesitationCount}`;
    if (input.strengths.length > 0) {
        prompt += `\n\nWORDS THEY NAILED (challenging words read correctly):
${input.strengths.map(w => `- "${w}"`).join('\n')}`;
    }
    if (input.struggles.length > 0) {
        prompt += `\n\nWORDS THEY STRUGGLED WITH:
${input.struggles.map(s => `- Said "${s.spoken}" instead of "${s.expected}"`).join('\n')}`;
    }
    if (input.primaryPattern) {
        prompt += `\n\nMAIN PATTERN NOTICED:
- Type: ${input.primaryPattern.description}
- Examples: ${input.primaryPattern.examples.join(', ')}`;
    }
    prompt += `\n\nGenerate the encouraging spoken summary now:`;
    return prompt;
}
/**
 * Generate a fallback summary if Gemini fails
 */
function generateFallbackSummary(studentName, metrics) {
    if (metrics.accuracy >= 95) {
        return `Great job, ${studentName}! You read ${metrics.totalWords} words with ${metrics.accuracy}% accuracy. That's really impressive! Keep up the awesome work, and remember - you're crushing it!`;
    }
    else if (metrics.accuracy >= 85) {
        return `Nice work, ${studentName}! You read ${metrics.totalWords} words and got ${metrics.correctCount} of them right. Keep practicing the tricky words and you'll get even better. You're doing great, ${studentName}!`;
    }
    else {
        return `Good effort, ${studentName}! You read ${metrics.totalWords} words today. Every time you practice, you get a little better. Keep working on those challenging words, and you'll see improvement. You've got this, ${studentName}!`;
    }
}
/**
 * Main function to generate AI summary
 */
async function generateAISummary(studentName, metrics, words, errorPatterns, patternSummary) {
    var _a, _b, _c, _d, _e;
    console.log(`Generating AI summary for ${studentName}...`);
    try {
        // Extract data for the prompt
        const strengths = extractStrengths(words);
        const struggles = extractStruggles(words);
        const primaryPattern = extractPrimaryPattern(errorPatterns);
        console.log(`Summary data: ${strengths.length} strengths, ${struggles.length} struggles, pattern: ${(primaryPattern === null || primaryPattern === void 0 ? void 0 : primaryPattern.type) || 'none'}`);
        const input = {
            studentName,
            metrics: {
                accuracy: metrics.accuracy,
                wordsPerMinute: metrics.wordsPerMinute,
                totalWords: metrics.totalWords,
                correctCount: metrics.correctCount,
                errorCount: metrics.errorCount,
                hesitationCount: metrics.hesitationCount,
                prosodyGrade: metrics.prosodyGrade,
            },
            strengths,
            struggles,
            primaryPattern,
        };
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(input);
        // Call Gemini
        const result = await generativeModel.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: systemPrompt + '\n\n' + userPrompt }
                    ],
                },
            ],
            generationConfig: {
                maxOutputTokens: 300,
                temperature: 0.8, // Slightly creative for fun name puns
            },
        });
        const response = result.response;
        const text = (_e = (_d = (_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text;
        if (!text) {
            console.error('Gemini returned empty response');
            return generateFallbackSummary(studentName, metrics);
        }
        // Clean up any accidental markdown or formatting
        const cleanedText = text
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/^- /gm, '')
            .replace(/^\d+\. /gm, '')
            .trim();
        console.log(`AI summary generated: ${cleanedText.length} chars`);
        return cleanedText;
    }
    catch (error) {
        console.error('Error generating AI summary:', error);
        return generateFallbackSummary(studentName, metrics);
    }
}
//# sourceMappingURL=summaryGenerator.js.map