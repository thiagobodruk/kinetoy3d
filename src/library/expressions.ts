// Built-in facial expressions.
import { defineExpression } from '../animation/expressions';

defineExpression({ name: 'neutral', idleLife: true, ui: { label: 'Neutral face', icon: 'smiley-blank' } });
defineExpression({ name: 'smile', channels: { smile: 1 }, ui: { label: 'Smile', icon: 'smiley', key: 'KeyY' } });
defineExpression({ name: 'talk', channels: { smile: 0.25 }, talk: true, ui: { label: 'Talk', icon: 'chat-teardrop-dots', key: 'KeyT' } }); // friendly talk
defineExpression({ name: 'sad', channels: { sad: 1 }, ui: { label: 'Sad', icon: 'smiley-sad', key: 'KeyU' } });
defineExpression({ name: 'surprise', channels: { surprise: 1 }, ui: { label: 'Surprise', icon: 'smiley-x-eyes' } });
