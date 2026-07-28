-- =============================================
-- SWAY: Asignar Amenazas y Habitats a Especies
-- Las tablas Amenazas y Habitats ya tienen datos.
-- Solo se insertan las relaciones en las tablas junction.
-- ON CONFLICT DO NOTHING evita duplicados.
-- =============================================

-- =============================================
-- HABITATS POR ESPECIE
-- =============================================

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Tortuga Verde'
  AND h.nombre IN ('Zona Costera','Manglares','Estuarios')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Ballena Azul'
  AND h.nombre IN ('Aguas Abiertas','Aguas Polares')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Vaquita Marina'
  AND h.nombre IN ('Zona Costera','Estuarios')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Coral Cuerno de Alce'
  AND h.nombre IN ('Arrecifes de Coral','Zona Costera')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Delfín Nariz de Botella'
  AND h.nombre IN ('Aguas Abiertas','Zona Costera')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Tiburón Ballena'
  AND h.nombre IN ('Arrecifes de Coral','Aguas Abiertas')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Manatí del Caribe'
  AND h.nombre IN ('Zona Costera','Manglares','Estuarios')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Tortuga Carey'
  AND h.nombre IN ('Arrecifes de Coral','Zona Costera')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Orca'
  AND h.nombre IN ('Aguas Abiertas','Zona Costera','Aguas Polares')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Cachalote'
  AND h.nombre IN ('Aguas Abiertas','Aguas Profundas','Zona Abisal','Montañas Submarinas')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Foca Monje del Mediterráneo'
  AND h.nombre IN ('Zona Costera','Arrecifes de Coral','Plataforma Continental')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Narval'
  AND h.nombre IN ('Aguas Polares','Aguas Abiertas')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Tiburón Blanco'
  AND h.nombre IN ('Zona Costera','Aguas Abiertas','Plataforma Continental','Zona Epipelágica')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Tiburón Martillo'
  AND h.nombre IN ('Zona Costera','Arrecifes de Coral','Zona Epipelágica')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Mantarraya Gigante'
  AND h.nombre IN ('Aguas Abiertas','Zona Epipelágica','Plataforma Continental')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Tiburón Peregrino'
  AND h.nombre IN ('Aguas Abiertas','Aguas Polares','Zona Epipelágica')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesHabitats" (id_especie, id_habitat)
SELECT e.id, h.id FROM "Especies" e, "Habitats" h
WHERE e.nombre_comun = 'Atún Rojo del Atlántico'
  AND h.nombre IN ('Aguas Abiertas','Zona Epipelágica','Plataforma Continental')
ON CONFLICT DO NOTHING;

-- =============================================
-- AMENAZAS POR ESPECIE
-- =============================================

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Tortuga Verde'
  AND a.nombre IN ('Contaminación Plástica','Cambio Climático','Pérdida de Hábitat','Pesca Incidental')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Ballena Azul'
  AND a.nombre IN ('Cambio Climático','Contaminación Química','Ruido Oceánico','Sobrepesca')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Vaquita Marina'
  AND a.nombre IN ('Sobrepesca','Ruido Oceánico','Pesca Incidental','Contaminación Química')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Coral Cuerno de Alce'
  AND a.nombre IN ('Cambio Climático','Acidificación Oceánica','Contaminación Química','Turismo Irresponsable')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Delfín Nariz de Botella'
  AND a.nombre IN ('Contaminación Plástica','Contaminación Química','Ruido Oceánico','Pesca Incidental')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Tiburón Ballena'
  AND a.nombre IN ('Sobrepesca','Cambio Climático','Ruido Oceánico','Turismo Irresponsable')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Manatí del Caribe'
  AND a.nombre IN ('Contaminación Plástica','Cambio Climático','Pérdida de Hábitat','Contaminación Química')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Tortuga Carey'
  AND a.nombre IN ('Contaminación Plástica','Cambio Climático','Pérdida de Hábitat','Turismo Irresponsable')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Orca'
  AND a.nombre IN ('Contaminación Plástica','Contaminación Química','Ruido Oceánico','Microplásticos','Derrame de Petróleo')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Cachalote'
  AND a.nombre IN ('Contaminación Plástica','Ruido Oceánico','Microplásticos','Sobrepesca','Derrame de Petróleo')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Foca Monje del Mediterráneo'
  AND a.nombre IN ('Pérdida de Hábitat','Turismo Irresponsable','Contaminación Plástica','Construcción Costera','Contaminación Química')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Narval'
  AND a.nombre IN ('Cambio Climático','Ruido Oceánico','Derrame de Petróleo','Sobrepesca')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Tiburón Blanco'
  AND a.nombre IN ('Sobrepesca','Pesca Incidental','Ruido Oceánico','Contaminación Plástica','Pesca Fantasma')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Tiburón Martillo'
  AND a.nombre IN ('Sobrepesca','Pesca Incidental','Pesca Fantasma','Dragado de Fondo')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Mantarraya Gigante'
  AND a.nombre IN ('Sobrepesca','Pesca Incidental','Contaminación Plástica','Microplásticos','Turismo Irresponsable')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Tiburón Peregrino'
  AND a.nombre IN ('Sobrepesca','Pesca Incidental','Contaminación Plástica','Derrame de Petróleo')
ON CONFLICT DO NOTHING;

INSERT INTO "EspeciesAmenazas" (id_especie, id_amenaza)
SELECT e.id, a.id FROM "Especies" e, "Amenazas" a
WHERE e.nombre_comun = 'Atún Rojo del Atlántico'
  AND a.nombre IN ('Sobrepesca','Pesca Incidental','Pesca Fantasma','Microplásticos')
ON CONFLICT DO NOTHING;
