-- Clario sample database. Safe to re-run: it drops and recreates the demo tables.
-- Dates are relative to today, so "last month" / "this week" questions always return data.

DROP TABLE IF EXISTS order_items, orders, products, customers, users CASCADE;

CREATE TABLE customers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  region      TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL
);

CREATE TABLE users (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT UNIQUE NOT NULL,
  plan         TEXT NOT NULL,
  signed_up_at TIMESTAMP NOT NULL
);

CREATE TABLE products (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  category  TEXT NOT NULL,
  price     NUMERIC(10,2) NOT NULL
);

CREATE TABLE orders (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  order_date   TIMESTAMP NOT NULL,
  status       TEXT NOT NULL
);

CREATE TABLE order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  product_id  INTEGER NOT NULL REFERENCES products(id),
  quantity    INTEGER NOT NULL,
  unit_price  NUMERIC(10,2) NOT NULL
);

SELECT setseed(0.42);

INSERT INTO customers (name, email, region, created_at)
SELECT
  (ARRAY['Aarav','Priya','Rohan','Ananya','Vikram','Meera','Kabir','Isha','Arjun','Diya',
         'Liam','Emma','Noah','Olivia','Mateo','Sofia','Yuki','Hana','Omar','Layla'])[1 + (g % 20)]
  || ' ' ||
  (ARRAY['Sharma','Patel','Reddy','Nair','Singh','Gupta','Mehta','Iyer','Khan','Das'])[1 + ((g / 2) % 10)],
  'customer' || g || '@example.com',
  (ARRAY['North','South','East','West','Central'])[1 + (g % 5)],
  now() - (random() * 365 || ' days')::interval
FROM generate_series(1, 60) AS g;

INSERT INTO users (name, email, plan, signed_up_at)
SELECT
  'User ' || g,
  'user' || g || '@example.com',
  (ARRAY['free','free','pro','team'])[1 + (g % 4)],
  CASE WHEN g <= 12 THEN now() - (random() * 6 || ' days')::interval
       ELSE now() - (random() * 200 || ' days')::interval END
FROM generate_series(1, 80) AS g;

INSERT INTO products (name, category, price) VALUES
  ('Aero Laptop 14',     'Electronics', 899.00),
  ('Pulse Earbuds',      'Electronics', 129.00),
  ('Nova Smartwatch',    'Electronics', 249.00),
  ('Trail Backpack',     'Outdoors',     89.00),
  ('Summit Tent',        'Outdoors',    239.00),
  ('Ember Camp Stove',   'Outdoors',     59.00),
  ('Ergo Desk Chair',    'Home',        319.00),
  ('Lumen Desk Lamp',    'Home',         45.00),
  ('Brew Coffee Maker',  'Home',        109.00),
  ('Flex Yoga Mat',      'Fitness',      35.00),
  ('Core Dumbbell Set',  'Fitness',     149.00),
  ('Stride Running Shoes','Fitness',    119.00);

INSERT INTO orders (customer_id, order_date, status)
SELECT
  1 + floor(random() * 60)::int,
  now() - (random() * 90 || ' days')::interval,
  (ARRAY['completed','completed','completed','completed','shipped','cancelled'])[1 + floor(random() * 6)::int]
FROM generate_series(1, 400);

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT o.id, p.id, 1 + floor(random() * 3)::int, p.price
FROM orders o
JOIN LATERAL (
  SELECT id, price FROM products
  WHERE o.id > 0
  ORDER BY random()
  LIMIT 1 + (o.id % 3)
) p ON TRUE;

CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_items_order ON order_items(order_id);
