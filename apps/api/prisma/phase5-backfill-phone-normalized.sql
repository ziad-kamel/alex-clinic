WITH normalized AS (
  SELECT
    "id",
    regexp_replace("phone", '[^0-9]', '', 'g') AS digits
  FROM "patients"
)
UPDATE "patients" AS patient
SET "phone_normalized" = CASE
  WHEN normalized.digits ~ '^0020[0-9]{10}$' THEN '0' || substring(normalized.digits FROM 5)
  WHEN normalized.digits ~ '^20[0-9]{10}$' THEN '0' || substring(normalized.digits FROM 3)
  ELSE normalized.digits
END
FROM normalized
WHERE patient."id" = normalized."id"
  AND patient."phone_normalized" = '';
