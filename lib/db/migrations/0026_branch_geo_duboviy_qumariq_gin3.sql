-- Heal three mis-pinned pharmacy coordinates (catalog truth).
-- Safe: updates only lat/lng for known official codes; no deletes.

UPDATE branches
SET lat = 41.251162, lng = 69.254236
WHERE code = 'VM-013';
--> statement-breakpoint
UPDATE branches
SET lat = 41.295212, lng = 69.334987
WHERE code = 'VM-016';
--> statement-breakpoint
UPDATE branches
SET lat = 41.355166, lng = 69.357891
WHERE code = 'VM-023';
