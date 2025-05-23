import amqp from 'amqplib';

const url = 'amqp://127.0.0.1:5672';

(async () => {
  try {
    const conn = await amqp.connect(url, { frameMax: 8192 });
    console.log('Connected!');
    await conn.close();
  } catch (err) {
    console.error('Failed:', err);
  }
})();