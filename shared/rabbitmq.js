// ============================================================
// RabbitMQ Utility — Shared connection, publish & consume
// Uses amqplib; falls back gracefully when RabbitMQ is unavailable
// ============================================================

const amqplib = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

let connection = null;
let channel = null;
let connecting = false;

/**
 * Connect to RabbitMQ with automatic retry.
 * @param {object} opts
 * @param {number} opts.retries  — max attempts (default 15)
 * @param {number} opts.delay    — ms between retries (default 3000)
 * @param {object} opts.logger   — optional logger ({ info, warn, error })
 * @returns {Promise<object>} amqplib channel
 */
async function connectRabbitMQ({ retries = 15, delay = 3000, logger } = {}) {
    const log = logger || console;

    if (channel) return channel;          // already connected
    if (connecting) {                     // another call is already retrying
        await new Promise(r => setTimeout(r, delay));
        return channel;
    }

    connecting = true;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            connection = await amqplib.connect(RABBITMQ_URL);
            channel = await connection.createChannel();
            await channel.prefetch(1);    // fair dispatch

            log.info ? log.info(`🐰 Connected to RabbitMQ at ${RABBITMQ_URL}`)
                     : console.log(`🐰 Connected to RabbitMQ at ${RABBITMQ_URL}`);

            // Reconnect on unexpected close
            connection.on('error', (err) => {
                (log.error || console.error)(`RabbitMQ connection error: ${err.message}`);
            });
            connection.on('close', () => {
                (log.warn || console.warn)('RabbitMQ connection closed — will reconnect on next publish/consume');
                channel = null;
                connection = null;
            });

            connecting = false;
            return channel;
        } catch (err) {
            const msg = `RabbitMQ connect attempt ${attempt}/${retries} failed: ${err.message}`;
            log.warn ? log.warn(msg) : console.warn(msg);
            if (attempt < retries) await new Promise(r => setTimeout(r, delay));
        }
    }

    connecting = false;
    throw new Error(`Failed to connect to RabbitMQ after ${retries} attempts`);
}

/**
 * Publish a JSON message to a durable queue.
 * @param {string} queue   — queue name (e.g. 'payment.success')
 * @param {object} message — plain object (will be JSON-stringified)
 */
async function publishToQueue(queue, message) {
    if (!channel) throw new Error('RabbitMQ channel not initialised — call connectRabbitMQ() first');
    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }            // survive broker restart
    );
}

/**
 * Start consuming from a durable queue.
 * Messages are ack'd after the callback resolves; nack'd (no requeue) on error.
 * @param {string}   queue    — queue name
 * @param {Function} callback — async (messageObject) => void
 */
async function consumeFromQueue(queue, callback) {
    if (!channel) throw new Error('RabbitMQ channel not initialised — call connectRabbitMQ() first');
    await channel.assertQueue(queue, { durable: true });
    channel.consume(queue, async (msg) => {
        if (!msg) return;
        try {
            const data = JSON.parse(msg.content.toString());
            await callback(data);
            channel.ack(msg);
        } catch (err) {
            console.error(`Error processing message from [${queue}]:`, err.message);
            channel.nack(msg, false, false);   // discard bad message
        }
    });
}

/**
 * Returns true if a RabbitMQ channel is currently connected.
 */
function isConnected() {
    return !!channel;
}

/**
 * Gracefully close the RabbitMQ connection.
 */
async function closeRabbitMQ() {
    try {
        if (channel) await channel.close();
        if (connection) await connection.close();
    } catch (_) { /* ignore */ }
    channel = null;
    connection = null;
}

module.exports = {
    connectRabbitMQ,
    publishToQueue,
    consumeFromQueue,
    isConnected,
    closeRabbitMQ,
};
