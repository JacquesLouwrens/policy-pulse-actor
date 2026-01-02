import { Actor } from 'apify';
import { extractSemanticMeaning } from './src/intelligence/semanticEngine.js';

Actor.main(async () => {
    const input = await Actor.getInput();

    const sampleText = input?.text || `
        The European Union will restrict the use of artificial intelligence
        systems in critical infrastructure starting next year.
    `;

    const semanticResult = extractSemanticMeaning(sampleText);

    await Actor.setValue('OUTPUT', semanticResult);
});
