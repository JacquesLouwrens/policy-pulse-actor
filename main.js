import { Actor } from 'apify';
import { extractSemanticMeaning } from './src/intelligence/semanticEngine.js';
import { detectSemanticChange } from './src/intelligence/changeDetector.js';

Actor.main(async () => {

    // STEP 2.5.2 — Load previous semantic snapshot
    const previousSemantic =
        (await Actor.getValue('semantic-last')) || {
            topics: [],
            obligations: [],
            permissions: [],
            restrictions: []
        };

    // Load input
    const input = await Actor.getInput();

    const sampleText = input?.text || `
        The European Union will restrict the use of artificial intelligence
        systems in critical infrastructure starting next year.
    `;

    // STEP 2.5.3 — Extract current semantic meaning
    const currentSemantic = extractSemanticMeaning(sampleText);

    // STEP 2.5.4 — Detect semantic change
    const semanticDiff = detectSemanticChange(previousSemantic, currentSemantic);

    // STEP 2.5.5 — Persist results
    await Actor.setValue('semantic-diff', semanticDiff);
    await Actor.setValue('semantic-current', currentSemantic);
    await Actor.setValue('semantic-last', currentSemantic);

    console.log('Semantic diff stored:', JSON.stringify(semanticDiff, null, 2));
});
