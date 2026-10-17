-- ADR-041: só renomeia a referência de cor; nome, arquivamento e vínculos da etiqueta não mudam
UPDATE "labels" SET "color_token" = CASE "color_token"
  WHEN 'info' THEN 'label-blue'
  WHEN 'sev-medium' THEN 'label-plum'
  WHEN 'bordo' THEN 'label-rose'
  WHEN 'accent' THEN 'label-teal'
  WHEN 'ok' THEN 'label-olive'
  WHEN 'warn' THEN 'label-brown'
  ELSE "color_token"
END
WHERE "color_token" IN ('info', 'sev-medium', 'bordo', 'accent', 'ok', 'warn');
