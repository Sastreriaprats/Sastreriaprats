-- Reasignar medidas de cliente que usaban el UUID antiguo (hardcoded) al tipo "body" real
-- para que sigan apareciendo en el perfil del cliente tras usar código en lugar de UUID fijo
UPDATE client_measurements
SET garment_type_id = gt.id
FROM garment_types gt
WHERE gt.code = 'body' AND gt.is_active = TRUE
  AND client_measurements.garment_type_id = 'dce0e940-467c-48ee-acd0-9ad1fed0241a';
