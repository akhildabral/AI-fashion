/**
 * One-time setup: creates the Plus and Pro monthly plans in Razorpay and
 * prints the plan IDs to put in backend.env. Run with the key env vars set:
 *
 *   RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... pnpm exec tsx scripts/razorpay-setup.ts
 */
import Razorpay from 'razorpay';

const key_id = process.env.RAZORPAY_KEY_ID;
const key_secret = process.env.RAZORPAY_KEY_SECRET;
if (!key_id || !key_secret) {
  console.error('Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET first.');
  process.exit(1);
}

const rzp = new Razorpay({ key_id, key_secret });

const PLANS = [
  { name: 'AI Fashion Plus', amount: 19900, envVar: 'RAZORPAY_PLAN_PLUS' },
  { name: 'AI Fashion Pro', amount: 49900, envVar: 'RAZORPAY_PLAN_PRO' },
];

for (const p of PLANS) {
  const plan = await rzp.plans.create({
    period: 'monthly',
    interval: 1,
    item: { name: p.name, amount: p.amount, currency: 'INR' },
  });
  console.log(`${p.envVar}=${plan.id}   # ${p.name} ₹${p.amount / 100}/mo`);
}
