-- Normalizar las especialidades de oficiales: de MAYÚSCULAS a formato correcto
-- Las 15 especialidades válidas son:
-- Americana, Chaqué, Abrigo, Frac, Chaleco, Pantalón, Teba, Camisería,
-- Americana Industrial, Pantalón Industrial, Chaqué Industrial, Chaleco Industrial,
-- Camisería Industrial, Gabardina, Cortador

UPDATE officials
SET specialty = (
  SELECT string_agg(
    CASE UPPER(TRIM(s))
      WHEN 'AMERICANA' THEN 'Americana'
      WHEN 'CHAQUÉ' THEN 'Chaqué'
      WHEN 'ABRIGO' THEN 'Abrigo'
      WHEN 'FRAC' THEN 'Frac'
      WHEN 'CHALECO' THEN 'Chaleco'
      WHEN 'PANTALÓN' THEN 'Pantalón'
      WHEN 'TEBA' THEN 'Teba'
      WHEN 'CAMISERÍA' THEN 'Camisería'
      WHEN 'AMERICANA INDUSTRIAL' THEN 'Americana Industrial'
      WHEN 'PANTALÓN INDUSTRIAL' THEN 'Pantalón Industrial'
      WHEN 'CHAQUÉ INDUSTRIAL' THEN 'Chaqué Industrial'
      WHEN 'CHALECO INDUSTRIAL' THEN 'Chaleco Industrial'
      WHEN 'CAMISERÍA INDUSTRIAL' THEN 'Camisería Industrial'
      WHEN 'GABARDINA' THEN 'Gabardina'
      WHEN 'CORTADOR' THEN 'Cortador'
      ELSE TRIM(s)
    END,
    ', '
  )
  FROM unnest(string_to_array(officials.specialty, ',')) AS s
)
WHERE specialty IS NOT NULL;
