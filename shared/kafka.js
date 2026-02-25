// In-memory event bus — Kafka replacement
// No external Kafka required

const EventEmitter = require('events');
const bus = new EventEmitter();
bus.setMaxListeners(50);

function createKafkaClient(clientId) {
    console.log(`✅ Event bus initialized (Kafka replacement) [${clientId}]`);
    return { clientId };
}

async function createProducer(kafka) {
    return {
        send: async (topic, messages) => {
            for (const msg of messages) {
                const value = typeof msg.value === 'string' ? JSON.parse(msg.value) : msg.value;
                bus.emit(topic, { topic, value });
            }
        },
        disconnect: async () => { },
    };
}

async function createConsumer(kafka, groupId, topics, handler) {
    for (const topic of topics) {
        bus.on(topic, async (data) => {
            try {
                await handler(data.topic, data.value, { partition: 0, offset: '0' });
            } catch (err) {
                console.error(`Event handler error [${topic}]:`, err.message);
            }
        });
    }
    console.log(`✅ Event consumer subscribed [${groupId}]: ${topics.join(', ')}`);
    return { disconnect: async () => { } };
}

module.exports = { createKafkaClient, createProducer, createConsumer };
