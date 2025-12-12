"use strict";
/**
 * AI Summary Generator
 * Uses Google AI Gemini to generate personalized student feedback
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAISummary = generateAISummary;
const generative_ai_1 = require("@google/generative-ai");
// Create Gemini client fresh each call to ensure latest API key is used
// (Firebase keeps containers warm, so cached clients may have stale keys)
function getGenAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY not configured');
        return null;
    }
    return new generative_ai_1.GoogleGenerativeAI(apiKey);
}
/**
 * Extract challenging words that were read correctly (strengths)
 */
function extractStrengths(words) {
    const strengths = [];
    for (const word of words) {
        if (word.status === 'correct' && word.expected.length >= 5) {
            const skipWords = ['because', 'before', 'through', 'people', 'should', 'would', 'could', 'there', 'their', 'about', 'after'];
            if (!skipWords.includes(word.expected.toLowerCase())) {
                strengths.push(word.expected);
            }
        }
    }
    const unique = [...new Set(strengths)];
    unique.sort((a, b) => b.length - a.length);
    return unique.slice(0, 5); // Return up to 5 for more detail
}
/**
 * Extract words that were misread (struggles)
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
    return struggles.slice(0, 4); // Return up to 4 for more detail
}
/**
 * Extract the primary error pattern
 */
function extractPrimaryPattern(errorPatterns) {
    if (errorPatterns.length === 0)
        return null;
    const skipAsPrimary = ['hesitation', 'repetition', 'self_correction', 'filler_word'];
    let selectedPattern = errorPatterns[0];
    if (skipAsPrimary.includes(errorPatterns[0].type) && errorPatterns.length > 1) {
        const alternative = errorPatterns.find(p => !skipAsPrimary.includes(p.type));
        if (alternative)
            selectedPattern = alternative;
    }
    return {
        type: selectedPattern.type,
        description: selectedPattern.pattern,
        examples: selectedPattern.examples.map(e => `${e.expected} to ${e.spoken}`).slice(0, 3),
    };
}
/**
 * Creative sign-off generators based on name
 */
function generateCreativeSignoff(firstName, accuracy) {
    const name = firstName.toLowerCase();
    const firstLetter = name[0].toUpperCase();
    // Name-based puns/rhymes/alliterations
    const nameBasedOptions = [
        `${firstName} is on fire today!`,
        `${firstLetter} is for ${firstName}, and also for phenomenal!`,
        `${firstName}, you are literally built different!`,
        `Keep shining, superstar ${firstName}!`,
        `${firstName} equals excellence, that is just math!`,
        `The one and only ${firstName}, making moves!`,
        `${firstName} squad, rise up!`,
        `That is the ${firstName} effect right there!`,
        `${firstName}, certified reader extraordinaire!`,
        `Give it up for my reader ${firstName}!`,
    ];
    // Performance-based closers
    const highAccuracyOptions = [
        `${firstName}, you are absolutely goated, no debate!`,
        `Legend status unlocked, ${firstName}!`,
        `${firstName} just showed everyone how it is done!`,
        `Main character energy from ${firstName} today!`,
        `${firstName}, that was lowkey iconic!`,
    ];
    const midAccuracyOptions = [
        `${firstName}, you are leveling up and I see it!`,
        `The growth is real, ${firstName}, keep going!`,
        `${firstName} is in their improvement era and I am here for it!`,
        `Every read makes you stronger, ${firstName}!`,
        `${firstName}, the comeback story is writing itself!`,
    ];
    const encouragementOptions = [
        `${firstName}, your potential is through the roof!`,
        `I believe in you, ${firstName}, for real!`,
        `${firstName}, champions are made through practice!`,
        `You got this, ${firstName}, no doubt about it!`,
        `${firstName}, the best is yet to come!`,
    ];
    // Pick based on accuracy
    let pool;
    if (accuracy >= 95) {
        pool = [...highAccuracyOptions, ...nameBasedOptions];
    }
    else if (accuracy >= 85) {
        pool = [...midAccuracyOptions, ...nameBasedOptions];
    }
    else {
        pool = [...encouragementOptions, ...nameBasedOptions];
    }
    return pool[Math.floor(Math.random() * pool.length)];
}
/**
 * Random greeting starters
 */
function getRandomGreeting(firstName) {
    const greetings = [
        `Hey ${firstName}!`,
        `What is up ${firstName}!`,
        `Yo ${firstName}!`,
        `Okay ${firstName}!`,
        `Let us go ${firstName}!`,
        `Alright ${firstName}!`,
        `Hey hey ${firstName}!`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
}
/**
 * Build the prompt for Gemini - UNIQUE AND CREATIVE EVERY TIME
 */
function buildPrompt(input) {
    const firstName = input.studentName.split(' ')[0];
    const randomSeed = Math.floor(Math.random() * 1000); // Add randomness
    let prompt = `You are an encouraging, enthusiastic reading coach giving spoken feedback to ${firstName}, a middle school student (6th-7th grade). Create a UNIQUE personalized audio summary of their reading assessment.

CRITICAL RULES:
- Write EXACTLY what will be spoken aloud - conversational and natural
- NO formatting, NO markdown, NO bullet points, NO asterisks
- Length: 8-10 sentences, approximately 45-55 seconds when spoken
- Be specific - mention actual words from the data provided
- Warm, encouraging tone - celebrate wins, normalize struggles
- Include 2-3 Gen Z slang terms naturally (no cap, fire, lowkey, W, goated, slay, valid, bussin, bet, hits different, understood the assignment, main character, era, ate that, served, period, based)
- IMPORTANT: Create a UNIQUE ending each time - use creative wordplay with their name "${firstName}" like rhymes, puns, alliteration, or playful nicknames. Be creative and funny! Never use generic endings.

VARIETY SEED: ${randomSeed} (use this to inspire different phrasing)

CREATIVE SIGN-OFF IDEAS for ${firstName}:
- Rhyme with their name if possible
- Alliteration (${firstName[0]}-words)
- Playful nickname based on performance
- Pop culture reference with their name
- Made-up superlative title

STRUCTURE TO FOLLOW:
1. Excited greeting (vary it - hey/yo/okay/what's up) and highlight their overall performance with a specific stat
2. Call out 2-3 specific impressive words they nailed - make them feel proud
3. Acknowledge 1-2 tricky words gently - normalize that these are hard for everyone
4. If there's a pattern, explain it simply and give ONE concrete practice tip
5. Encouraging statement about their progress and potential
6. Fun, UNIQUE creative sign-off with their name - BE ORIGINAL AND FUNNY

ASSESSMENT DATA FOR ${firstName.toUpperCase()}:
- Overall accuracy: ${input.metrics.accuracy}%
- Total words attempted: ${input.metrics.totalWords}
- Words read correctly: ${input.metrics.correctCount}
- Reading speed: ${input.metrics.wordsPerMinute} correct words per minute
- Fluency rating: ${input.metrics.prosodyGrade}
- Hesitations/pauses: ${input.metrics.hesitationCount}`;
    if (input.strengths.length > 0) {
        prompt += `\n\nIMPRESSIVE WORDS THEY NAILED:\n${input.strengths.map(w => `- "${w}"`).join('\n')}`;
    }
    if (input.struggles.length > 0) {
        prompt += `\n\nWORDS THAT WERE TRICKY:\n${input.struggles.map(s => `- Said "${s.spoken}" instead of "${s.expected}"`).join('\n')}`;
    }
    if (input.primaryPattern) {
        prompt += `\n\nPATTERN NOTICED:\n- ${input.primaryPattern.description}\n- Examples: ${input.primaryPattern.examples.join(', ')}`;
    }
    prompt += `\n\nNow write the encouraging spoken feedback for ${firstName}. Remember: natural speech, 8-10 sentences, specific word mentions, Gen Z slang, and most importantly a CREATIVE UNIQUE sign-off that is different every time:`;
    return prompt;
}
/**
 * Generate a detailed fallback summary if Gemini fails - NOW WITH VARIETY
 */
function generateFallbackSummary(studentName, metrics, strengths, struggles) {
    var _a;
    const firstName = studentName.split(' ')[0];
    const strengthWord1 = strengths[0] || '';
    const strengthWord2 = strengths[1] || '';
    const struggleWord = ((_a = struggles[0]) === null || _a === void 0 ? void 0 : _a.expected) || '';
    const greeting = getRandomGreeting(firstName);
    const signoff = generateCreativeSignoff(firstName, metrics.accuracy);
    // Random slang options to vary the language
    const slangOptions = {
        impressive: ['no cap', 'for real', 'straight up', 'honestly', 'lowkey'],
        good: ['fire', 'valid', 'solid', 'bussin', 'on point'],
        great: ['goated', 'elite', 'next level', 'built different', 'iconic'],
    };
    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    if (metrics.accuracy >= 95) {
        let summary = `${greeting} ${pickRandom(slangOptions.impressive)}, you absolutely crushed this reading assessment! `;
        summary += `${metrics.accuracy} percent accuracy is seriously impressive, that is a huge W. `;
        if (strengthWord1) {
            summary += `Words like ${strengthWord1}${strengthWord2 ? ' and ' + strengthWord2 : ''}, you read those perfectly! `;
        }
        else {
            summary += `You handled some really challenging vocabulary! `;
        }
        summary += `Your reading speed of ${metrics.wordsPerMinute} words per minute shows you are not just accurate, you are confident too. `;
        if (struggleWord) {
            summary += `Even ${struggleWord} which trips up a lot of readers did not slow you down much. `;
        }
        else {
            summary += `You powered through the whole passage like a pro. `;
        }
        summary += `Keep this energy going because you are genuinely talented at this. `;
        summary += signoff;
        return summary;
    }
    else if (metrics.accuracy >= 85) {
        let summary = `${greeting} ${pickRandom(slangOptions.good)} reading today, you got ${metrics.correctCount} words right and that is ${pickRandom(slangOptions.good)} work. `;
        if (strengthWord1) {
            summary += `You nailed words like ${strengthWord1}${strengthWord2 ? ' and ' + strengthWord2 : ''} which are ${pickRandom(slangOptions.impressive)} difficult! `;
        }
        else {
            summary += `You handled a lot of the tricky words really well! `;
        }
        if (struggleWord) {
            summary += `Now ${struggleWord} gave you a little trouble, but ${pickRandom(slangOptions.impressive)} that word is tricky for everyone. `;
        }
        else {
            summary += `A few words were challenging but that happens to all readers. `;
        }
        summary += `Here is a quick tip, when you hit a tough word, try breaking it into smaller chunks and sound it out piece by piece. `;
        summary += `Your ${metrics.wordsPerMinute} words per minute shows you have got good flow going. `;
        summary += `Keep practicing and you will be even more ${pickRandom(slangOptions.great)} next time. `;
        summary += signoff;
        return summary;
    }
    else {
        let summary = `${greeting} Thanks for giving this your all today, that takes real effort and I respect it. `;
        summary += `You read ${metrics.totalWords} words and got ${metrics.correctCount} of them right, that is progress you can build on. `;
        if (strengthWord1) {
            summary += `You actually nailed ${strengthWord1} which is a tricky one, ${pickRandom(slangOptions.impressive)}! `;
        }
        else {
            summary += `Some of those words were genuinely challenging. `;
        }
        if (struggleWord) {
            summary += `Words like ${struggleWord} are hard, but here is the thing, the more you see them, the easier they get. `;
        }
        else {
            summary += `The tricky words will get easier with practice, that is just facts. `;
        }
        summary += `Try reading out loud for just ten minutes a day, it makes a huge difference. `;
        summary += `Every single time you practice, you are leveling up your skills. `;
        summary += signoff;
        return summary;
    }
}
/**
 * Main function to generate AI summary
 */
async function generateAISummary(studentName, metrics, words, errorPatterns, patternSummary) {
    console.log(`Generating AI summary for ${studentName}...`);
    const strengths = extractStrengths(words);
    const struggles = extractStruggles(words);
    const primaryPattern = extractPrimaryPattern(errorPatterns);
    console.log(`Summary data: ${strengths.length} strengths, ${struggles.length} struggles, pattern: ${(primaryPattern === null || primaryPattern === void 0 ? void 0 : primaryPattern.type) || 'none'}`);
    const ai = getGenAI();
    if (!ai) {
        console.log('Gemini API key not configured, using detailed fallback');
        return generateFallbackSummary(studentName, metrics, strengths, struggles);
    }
    try {
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
        const prompt = buildPrompt(input);
        const model = ai.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                maxOutputTokens: 400,
                temperature: 0.95, // Higher for more creative, varied outputs
                topP: 0.95, // Allow more diverse word choices
                topK: 40, // Consider more options
            },
        });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        if (!text) {
            console.error('Gemini returned empty response');
            return generateFallbackSummary(studentName, metrics, strengths, struggles);
        }
        // Clean up any accidental formatting
        const cleanedText = text
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/^- /gm, '')
            .replace(/^\d+\. /gm, '')
            .replace(/^#{1,6} /gm, '')
            .replace(/\n+/g, ' ')
            .trim();
        console.log(`Gemini AI summary generated: ${cleanedText.length} chars`);
        return cleanedText;
    }
    catch (error) {
        console.error('Error generating AI summary with Gemini:', error);
        return generateFallbackSummary(studentName, metrics, strengths, struggles);
    }
}
//# sourceMappingURL=summaryGenerator.js.map