import { Actor } from 'apify';
import { extractSemanticMeaning } from './src/intelligence/semanticEngine.js';
import { detectSemanticChange } from './src/intelligence/changeDetector.js';
;

Actor.main(async () => {
    const input = await Actor.getInput();

    const sampleText = input?.text || `
        The European Union will restrict the use of artificial intelligence
        systems in critical infrastructure starting next year.
    `;

    const semanticResult = extractSemanticMeaning(sampleText);

    await Actor.setValue('OUTPUT', semanticResult);
    const previousSemantic = {
    topics: ["data protection", "user consent"],
    obligations: ["store data securely"],
    permissions: ["share with partners"],
    restrictions: ["no resale"]
};

const currentSemantic = {
    topics: ["data protection", "user consent", "AI processing"],
    obligations: ["store data securely", "notify breaches"],
    permissions: ["share with partners"],
    restrictions: []
};

const semanticDiff = detectSemanticChange(previousSemantic, currentSemantic);

console.log('Semantic Change Result:', JSON.stringify(semanticDiff, null, 2));

});
