-- =====================================================
-- Seed Data for Development
-- =====================================================

-- Insert locations
INSERT INTO locations (id, city, state, country) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Mumbai', 'Maharashtra', 'India'),
  ('a1000000-0000-0000-0000-000000000002', 'Delhi', 'Delhi', 'India'),
  ('a1000000-0000-0000-0000-000000000003', 'Bangalore', 'Karnataka', 'India'),
  ('a1000000-0000-0000-0000-000000000004', 'Chennai', 'Tamil Nadu', 'India'),
  ('a1000000-0000-0000-0000-000000000005', 'Hyderabad', 'Telangana', 'India');

-- Insert theaters
INSERT INTO theaters (id, name, address, location_id) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'PVR Phoenix', 'Lower Parel, Mumbai', 'a1000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000002', 'INOX Nariman Point', 'Nariman Point, Mumbai', 'a1000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000003', 'PVR Select City', 'Saket, Delhi', 'a1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-0000-0000-000000000004', 'INOX Forum', 'Koramangala, Bangalore', 'a1000000-0000-0000-0000-000000000003'),
  ('b1000000-0000-0000-0000-000000000005', 'SPI Palazzo', 'Anna Nagar, Chennai', 'a1000000-0000-0000-0000-000000000004');

-- Insert screens
INSERT INTO screens (id, theater_id, name, total_seats) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Screen 1 - IMAX', 120),
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Screen 2 - 4DX', 80),
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 'Screen 1', 100),
  ('c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000003', 'Screen 1 - Dolby', 150),
  ('c1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000004', 'Screen 1', 100);

-- Insert movies
INSERT INTO movies (id, title, description, genre, duration_minutes, language, rating, poster_url, release_date) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Inception', 'A thief who enters the dreams of others to steal secrets from their subconscious.', 'Sci-Fi', 148, 'English', 8.8, '/posters/inception.jpg', '2024-01-15'),
  ('d1000000-0000-0000-0000-000000000002', 'The Dark Knight', 'Batman faces the Joker, a criminal mastermind who wants to plunge Gotham into anarchy.', 'Action', 152, 'English', 9.0, '/posters/dark-knight.jpg', '2024-02-20'),
  ('d1000000-0000-0000-0000-000000000003', 'Interstellar', 'A team of explorers travel through a wormhole in space to ensure humanity''s survival.', 'Sci-Fi', 169, 'English', 8.6, '/posters/interstellar.jpg', '2024-03-10'),
  ('d1000000-0000-0000-0000-000000000004', 'RRR', 'A fictional story about two Indian revolutionaries, Alluri Sitarama Raju and Komaram Bheem.', 'Action', 187, 'Telugu', 8.0, '/posters/rrr.jpg', '2024-04-01'),
  ('d1000000-0000-0000-0000-000000000005', 'Jawan', 'A man is driven by a personal vendetta to rectify the wrongs in society.', 'Action', 169, 'Hindi', 7.5, '/posters/jawan.jpg', '2024-05-15'),
  ('d1000000-0000-0000-0000-000000000006', 'Oppenheimer', 'The story of J. Robert Oppenheimer and the creation of the atomic bomb.', 'Drama', 180, 'English', 8.5, '/posters/oppenheimer.jpg', '2024-06-20');

-- Generate seats for Screen 1 (IMAX - 120 seats: A-J rows, 12 seats each)
-- Rows A-C: VIP, D-G: Premium, H-J: Regular
DO $$
DECLARE
  row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  r TEXT;
  s INTEGER;
  seat_t VARCHAR(20);
  price_m DECIMAL;
BEGIN
  FOREACH r IN ARRAY row_labels LOOP
    IF r IN ('A','B','C') THEN seat_t := 'vip'; price_m := 1.50;
    ELSIF r IN ('D','E','F','G') THEN seat_t := 'premium'; price_m := 1.25;
    ELSE seat_t := 'regular'; price_m := 1.00;
    END IF;
    FOR s IN 1..12 LOOP
      INSERT INTO seats (screen_id, row_label, seat_number, seat_type, price_multiplier)
      VALUES ('c1000000-0000-0000-0000-000000000001', r, s, seat_t, price_m);
    END LOOP;
  END LOOP;
END $$;

-- Generate seats for Screen 2 (4DX - 80 seats: A-H rows, 10 seats each)
DO $$
DECLARE
  row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H'];
  r TEXT;
  s INTEGER;
  seat_t VARCHAR(20);
  price_m DECIMAL;
BEGIN
  FOREACH r IN ARRAY row_labels LOOP
    IF r IN ('A','B') THEN seat_t := 'vip'; price_m := 1.50;
    ELSIF r IN ('C','D','E') THEN seat_t := 'premium'; price_m := 1.25;
    ELSE seat_t := 'regular'; price_m := 1.00;
    END IF;
    FOR s IN 1..10 LOOP
      INSERT INTO seats (screen_id, row_label, seat_number, seat_type, price_multiplier)
      VALUES ('c1000000-0000-0000-0000-000000000002', r, s, seat_t, price_m);
    END LOOP;
  END LOOP;
END $$;

-- Generate seats for Screen 3 (100 seats: A-J, 10 each)
DO $$
DECLARE
  row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  r TEXT;
  s INTEGER;
  seat_t VARCHAR(20);
  price_m DECIMAL;
BEGIN
  FOREACH r IN ARRAY row_labels LOOP
    IF r IN ('A','B') THEN seat_t := 'vip'; price_m := 1.50;
    ELSIF r IN ('C','D','E') THEN seat_t := 'premium'; price_m := 1.25;
    ELSE seat_t := 'regular'; price_m := 1.00;
    END IF;
    FOR s IN 1..10 LOOP
      INSERT INTO seats (screen_id, row_label, seat_number, seat_type, price_multiplier)
      VALUES ('c1000000-0000-0000-0000-000000000003', r, s, seat_t, price_m);
    END LOOP;
  END LOOP;
END $$;

-- Generate seats for Screen 4 (Dolby - 150 seats: A-O, 10 each)
DO $$
DECLARE
  row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'];
  r TEXT;
  s INTEGER;
  seat_t VARCHAR(20);
  price_m DECIMAL;
BEGIN
  FOREACH r IN ARRAY row_labels LOOP
    IF r IN ('A','B','C') THEN seat_t := 'vip'; price_m := 1.50;
    ELSIF r IN ('D','E','F','G','H') THEN seat_t := 'premium'; price_m := 1.25;
    ELSE seat_t := 'regular'; price_m := 1.00;
    END IF;
    FOR s IN 1..10 LOOP
      INSERT INTO seats (screen_id, row_label, seat_number, seat_type, price_multiplier)
      VALUES ('c1000000-0000-0000-0000-000000000004', r, s, seat_t, price_m);
    END LOOP;
  END LOOP;
END $$;

-- Generate seats for Screen 5 (100 seats: A-J, 10 each)
DO $$
DECLARE
  row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  r TEXT;
  s INTEGER;
  seat_t VARCHAR(20);
  price_m DECIMAL;
BEGIN
  FOREACH r IN ARRAY row_labels LOOP
    IF r IN ('A','B') THEN seat_t := 'vip'; price_m := 1.50;
    ELSIF r IN ('C','D','E') THEN seat_t := 'premium'; price_m := 1.25;
    ELSE seat_t := 'regular'; price_m := 1.00;
    END IF;
    FOR s IN 1..10 LOOP
      INSERT INTO seats (screen_id, row_label, seat_number, seat_type, price_multiplier)
      VALUES ('c1000000-0000-0000-0000-000000000005', r, s, seat_t, price_m);
    END LOOP;
  END LOOP;
END $$;

-- Insert shows (future dates)
INSERT INTO shows (id, movie_id, screen_id, start_time, end_time, base_price) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '2026-03-01 10:00:00+05:30', '2026-03-01 12:30:00+05:30', 350.00),
  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '2026-03-01 14:00:00+05:30', '2026-03-01 16:30:00+05:30', 400.00),
  ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', '2026-03-01 11:00:00+05:30', '2026-03-01 13:30:00+05:30', 300.00),
  ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', '2026-03-01 15:00:00+05:30', '2026-03-01 17:50:00+05:30', 280.00),
  ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000004', '2026-03-01 18:00:00+05:30', '2026-03-01 21:10:00+05:30', 320.00),
  ('e1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000005', '2026-03-01 20:00:00+05:30', '2026-03-01 22:50:00+05:30', 300.00),
  ('e1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000001', '2026-03-01 19:00:00+05:30', '2026-03-01 22:00:00+05:30', 450.00),
  ('e1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000004', '2026-03-02 10:00:00+05:30', '2026-03-02 12:30:00+05:30', 350.00),
  ('e1000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', '2026-03-02 14:00:00+05:30', '2026-03-02 16:50:00+05:30', 380.00);

-- Insert admin user (password: admin123)
INSERT INTO users (id, email, password_hash, name, role) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'admin@movieticket.com', '$2b$10$8KzaNdKBiOjCfK.sFzfOm.X14sTNnVMuQ2iE.rHrcu1G9o0JLH0Xi', 'System Admin', 'admin');
