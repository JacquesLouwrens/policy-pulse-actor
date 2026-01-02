import { Actor } from 'apify';

Actor.main(async () => {
    const input = await Actor.getInput();
    console.log('Actor input:', input);

    await Actor.setValue('OUTPUT', {
        status: 'Actor initialized successfully',
        timestamp: new Date().toISOString(),
    });
});
