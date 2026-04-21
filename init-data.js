import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'app.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Check if data already exists
const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (count.count > 0) {
  console.log('Data already seeded, skipping...');
  db.close();
  process.exit(0);
}

console.log('Seeding database with sample data...');

// Helper function to generate password hash
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

// Helper function to generate API key
function generateApiKey() {
  return 'bpl_' + crypto.randomBytes(24).toString('hex');
}

// Helper function to generate token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Helper to get random date within last N days
function randomDate(daysAgo) {
  const now = Date.now();
  const past = now - (daysAgo * 86400000);
  return new Date(past + Math.random() * (now - past)).toISOString();
}

// Helper to get date string (YYYY-MM-DD)
function dateString(daysAgo) {
  const date = new Date(Date.now() - daysAgo * 86400000);
  return date.toISOString().slice(0, 10);
}

// Seed data arrays
const users = [
  { email: 'admin@builddypay.com', password: 'admin123', name: 'Alex Thompson', role: 'admin' },
  { email: 'sarah.chen@email.com', password: 'password123', name: 'Sarah Chen', role: 'user' },
  { email: 'marcus.johnson@company.org', password: 'password123', name: 'Marcus Johnson', role: 'user' },
  { email: 'elena.rodriguez@gmail.com', password: 'password123', name: 'Elena Rodriguez', role: 'user' },
  { email: 'james.obrien@startup.io', password: 'password123', name: "James O'Brien", role: 'user' },
  { email: 'priya.patel@tech.co', password: 'password123', name: 'Priya Patel', role: 'user' },
];

const subscriptions = [
  { userId: 1, plan: 'enterprise', status: 'active', stripeId: 'sub_enterprise_001' },
  { userId: 2, plan: 'pro', status: 'active', stripeId: 'sub_pro_002' },
  { userId: 3, plan: 'pro', status: 'active', stripeId: 'sub_pro_003' },
  { userId: 4, plan: 'free', status: 'active', stripeId: null },
  { userId: 5, plan: 'pro', status: 'past_due', stripeId: 'sub_pro_005' },
  { userId: 6, plan: 'free', status: 'active', stripeId: null },
];

const orders = [
  { buyerName: 'David Kim', buyerEmail: 'david.kim@freelance.dev', amount: 2999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_001', daysAgo: 1 },
  { buyerName: 'Lisa Wang', buyerEmail: 'l.wang@design.co', amount: 1999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_002', daysAgo: 2 },
  { buyerName: 'Robert Martinez', buyerEmail: 'robert.m@gmail.com', amount: 4999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_003', daysAgo: 3 },
  { buyerName: 'Anna Kowalski', buyerEmail: 'anna.k@agency.pl', amount: 999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_004', daysAgo: 4 },
  { buyerName: 'Michael Brown', buyerEmail: 'm.brown@company.com', amount: 2999, currency: 'usd', status: 'pending', stripeSessionId: 'cs_test_005', daysAgo: 5 },
  { buyerName: 'Sophie Turner', buyerEmail: 'sophie.t@email.co.uk', amount: 1999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_006', daysAgo: 6 },
  { buyerName: 'Yuki Tanaka', buyerEmail: 'yuki.tanaka@tech.jp', amount: 4999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_007', daysAgo: 7 },
  { buyerName: 'Carlos Silva', buyerEmail: 'carlos.s@startup.mx', amount: 999, currency: 'usd', status: 'failed', stripeSessionId: 'cs_test_008', daysAgo: 8 },
  { buyerName: 'Emma Watson', buyerEmail: 'emma.w@designer.io', amount: 2999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_009', daysAgo: 10 },
  { buyerName: 'Ahmed Hassan', buyerEmail: 'ahmed.h@dev.eg', amount: 1999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_010', daysAgo: 12 },
  { buyerName: 'Julia Novak', buyerEmail: 'julia.n@creative.cz', amount: 4999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_011', daysAgo: 14 },
  { buyerName: 'Ryan O\'Connor', buyerEmail: 'ryan.oc@biz.ie', amount: 999, currency: 'usd', status: 'pending', stripeSessionId: 'cs_test_012', daysAgo: 15 },
  { buyerName: 'Mei Lin', buyerEmail: 'mei.lin@studio.cn', amount: 2999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_013', daysAgo: 17 },
  { buyerName: 'Thomas Mueller', buyerEmail: 't.mueller@tech.de', amount: 1999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_014', daysAgo: 19 },
  { buyerName: 'Isabella Rossi', buyerEmail: 'isabella.r@design.it', amount: 4999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_015', daysAgo: 21 },
  { buyerName: 'Nathan Scott', buyerEmail: 'nathan.s@email.com', amount: 999, currency: 'usd', status: 'failed', stripeSessionId: 'cs_test_016', daysAgo: 23 },
  { buyerName: 'Aisha Patel', buyerEmail: 'aisha.p@company.in', amount: 2999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_017', daysAgo: 25 },
  { buyerName: 'Lucas Fernandez', buyerEmail: 'lucas.f@dev.ar', amount: 1999, currency: 'usd', status: 'completed', stripeSessionId: 'cs_test_018', daysAgo: 27 },
];

const usageData = [
  // User 1 - Admin (enterprise)
  { userId: 1, metric: 'api_calls', value: 145, daysAgo: 0 },
  { userId: 1, metric: 'api_calls', value: 203, daysAgo: 1 },
  { userId: 1, metric: 'api_calls', value: 178, daysAgo: 2 },
  { userId: 1, metric: 'page_views', value: 89, daysAgo: 0 },
  { userId: 1, metric: 'page_views', value: 112, daysAgo: 1 },
  { userId: 1, metric: 'downloads', value: 5, daysAgo: 0 },
  
  // User 2 - Sarah (pro)
  { userId: 2, metric: 'api_calls', value: 67, daysAgo: 0 },
  { userId: 2, metric: 'api_calls', value: 89, daysAgo: 1 },
  { userId: 2, metric: 'api_calls', value: 54, daysAgo: 2 },
  { userId: 2, metric: 'page_views', value: 45, daysAgo: 0 },
  { userId: 2, metric: 'page_views', value: 38, daysAgo: 1 },
  { userId: 2, metric: 'downloads', value: 3, daysAgo: 0 },
  { userId: 2, metric: 'downloads', value: 2, daysAgo: 1 },
  
  // User 3 - Marcus (pro)
  { userId: 3, metric: 'api_calls', value: 92, daysAgo: 0 },
  { userId: 3, metric: 'api_calls', value: 78, daysAgo: 1 },
  { userId: 3, metric: 'page_views', value: 56, daysAgo: 0 },
  { userId: 3, metric: 'page_views', value: 62, daysAgo: 1 },
  { userId: 3, metric: 'downloads', value: 4, daysAgo: 0 },
  
  // User 4 - Elena (free)
  { userId: 4, metric: 'api_calls', value: 12, daysAgo: 0 },
  { userId: 4, metric: 'api_calls', value: 8, daysAgo: 1 },
  { userId: 4, metric: 'page_views', value: 15, daysAgo: 0 },
  { userId: 4, metric: 'downloads', value: 1, daysAgo: 0 },
  
  // User 5 - James (pro, past_due)
  { userId: 5, metric: 'api_calls', value: 45, daysAgo: 0 },
  { userId: 5, metric: 'page_views', value: 23, daysAgo: 0 },
  
  // User 6 - Priya (free)
  { userId: 6, metric: 'api_calls', value: 5, daysAgo: 0 },
  { userId: 6, metric: 'api_calls', value: 3, daysAgo: 1 },
  { userId: 6, metric: 'page_views', value: 8, daysAgo: 0 },
  
  // More historical data spread across users
  { userId: 2, metric: 'api_calls', value: 72, daysAgo: 5 },
  { userId: 2, metric: 'api_calls', value: 65, daysAgo: 7 },
  { userId: 3, metric: 'api_calls', value: 81, daysAgo: 4 },
  { userId: 3, metric: 'api_calls', value: 93, daysAgo: 6 },
  { userId: 1, metric: 'api_calls', value: 156, daysAgo: 5 },
  { userId: 1, metric: 'api_calls', value: 189, daysAgo: 8 },
  { userId: 4, metric: 'api_calls', value: 15, daysAgo: 3 },
  { userId: 5, metric: 'api_calls', value: 38, daysAgo: 2 },
  { userId: 2, metric: 'downloads', value: 3, daysAgo: 3 },
  { userId: 1, metric: 'downloads', value: 7, daysAgo: 2 },
  { userId: 3, metric: 'downloads', value: 5, daysAgo: 4 },
];

// Execute all inserts in a transaction
const insertAll = db.transaction(() => {
  // Insert users
  const insertUser = db.prepare(`
    INSERT INTO users (email, password, name, role, api_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const now = new Date().toISOString();
  users.forEach((user, index) => {
    const createdAt = randomDate(30 - index * 3);
    const updatedAt = Math.random() > 0.5 ? randomDate(2) : createdAt;
    insertUser.run(
      user.email,
      hashPassword(user.password),
      user.name,
      user.role,
      generateApiKey(),
      createdAt,
      updatedAt
    );
  });
  
  // Insert subscriptions
  const insertSubscription = db.prepare(`
    INSERT INTO subscriptions (user_id, plan, status, stripe_id, current_period_start, current_period_end, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  subscriptions.forEach((sub) => {
    const periodStart = randomDate(20);
    const periodEnd = new Date(new Date(periodStart).getTime() + 30 * 86400000).toISOString();
    const createdAt = randomDate(45);
    const updatedAt = Math.random() > 0.5 ? randomDate(5) : createdAt;
    insertSubscription.run(
      sub.userId,
      sub.plan,
      sub.status,
      sub.stripeId,
      periodStart,
      periodEnd,
      createdAt,
      updatedAt
    );
  });
  
  // Insert orders
  const insertOrder = db.prepare(`
    INSERT INTO orders (buyer_name, buyer_email, amount, currency, status, stripe_session_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  orders.forEach((order) => {
    const createdAt = randomDate(order.daysAgo);
    insertOrder.run(
      order.buyerName,
      order.buyerEmail,
      order.amount,
      order.currency,
      order.status,
      order.stripeSessionId,
      createdAt
    );
  });
  
  // Insert usage tracking
  const insertUsage = db.prepare(`
    INSERT INTO usage_tracking (user_id, metric, value, date, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  usageData.forEach((usage) => {
    const date = dateString(usage.daysAgo);
    const createdAt = new Date(Date.now() - usage.daysAgo * 86400000).toISOString();
    insertUsage.run(
      usage.userId,
      usage.metric,
      usage.value,
      date,
      createdAt
    );
  });
  
  // Insert refresh tokens for demo users
  const insertToken = db.prepare(`
    INSERT INTO refresh_tokens (user_id, token, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `);
  
  // Active tokens for first 3 users
  [1, 2, 3].forEach((userId) => {
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString(); // 7 days from now
    insertToken.run(
      userId,
      generateToken(),
      expiresAt,
      new Date().toISOString()
    );
  });
  
  // Expired token for user 4
  const expiredAt = new Date(Date.now() - 2 * 86400000).toISOString(); // 2 days ago
  insertToken.run(
    4,
    generateToken(),
    expiredAt,
    new Date(Date.now() - 9 * 86400000).toISOString()
  );
});

// Run the transaction
insertAll();

// Get counts for summary
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
const subscriptionCount = db.prepare('SELECT COUNT(*) as count FROM subscriptions').get().count;
const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
const usageCount = db.prepare('SELECT COUNT(*) as count FROM usage_tracking').get().count;
const tokenCount = db.prepare('SELECT COUNT(*) as count FROM refresh_tokens').get().count;

// Close database
db.close();

// Print summary
console.log('');
console.log('✅ Database seeded successfully!');
console.log('');
console.log('Seeded:');
console.log(`  - ${userCount} users`);
console.log(`  - ${subscriptionCount} subscriptions`);
console.log(`  - ${orderCount} orders`);
console.log(`  - ${usageCount} usage tracking records`);
console.log(`  - ${tokenCount} refresh tokens`);
console.log('');
console.log('Demo credentials:');
console.log('  Admin:  admin@builddypay.com / admin123');
console.log('  User:   sarah.chen@email.com / password123');
console.log('  User:   marcus.johnson@company.org / password123');
console.log('');