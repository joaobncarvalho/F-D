-- =====================================================================
-- F&D — Conteúdo (game_types + prompts)
-- =====================================================================
-- GERADO por server/db/generate.mjs a partir de src/content/prompts.data.js —
-- o MESMO banco que o prisma/seed.js semeia, para os dois nunca divergirem.
-- NÃO editar à mão: correr `npm run db:sql`.
--
-- Idempotente: os ids são derivados do texto (sempre iguais) e o ON CONFLICT
-- atualiza em vez de duplicar. Correr DEPOIS de 01_schema.sql.
--
-- 18 tipos de jogo · 360 prompts
-- =====================================================================

BEGIN;

-- ---------- Tipos de jogo ----------
INSERT INTO game_types (id, key, label, active) VALUES

  ('c6c052d9-c5a9-5575-8eec-842faa169ebd', 'boca_calada', 'Boca Calada', true),
  ('b77b4756-e507-59c5-8a10-d327f455bedd', 'desafio', 'Desafio', true),
  ('a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'isto_ou_aquilo', 'Isto ou Aquilo', true),
  ('5df71400-28e5-50f0-805a-2df1591cf6df', 'intrigas', 'Intrigas', true),
  ('157382b6-9786-5855-854d-7729b00394e2', 'segredos', 'Segredos Anónimos', true),
  ('19e5a663-b7fe-51e8-8e6e-f7f24e86364f', 'piramide', 'Piramide', true),
  ('3e94cdf0-1a95-5279-872d-e90376428dab', 'vasco', 'Jogo do Vasco', true),
  ('9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'categoria_relampago', 'Categoria Relâmpago', true),
  ('4e111c07-99ef-5c19-8dd3-4f89849feb59', 'mimica', 'Mímica', true),
  ('0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'roleta_russa', 'Roleta Russa', true),
  ('7d19d415-d739-5cd6-8b4b-bafdba406e8a', 'duelo', 'Duelo 1v1', true),
  ('006d3b95-6cd2-5db6-8141-04faccbfc899', 'eu_nunca', 'Eu Nunca', true),
  ('2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'mais_provavel', 'Mais Provável', true),
  ('15a6c9e2-8ef7-51b9-8937-2997667586bb', 'termometro', 'Termómetro', true),
  ('1534967b-23af-55ec-8f81-b16cbfc4c026', 'desenho', 'Desenha', true),
  ('c57ffbfd-b208-5e95-8e4d-dfbe4ae37aec', 'quem_disse', 'Quem Disse', true),
  ('42526193-8fa9-57b5-85cd-5eefdd70385d', 'cascata', 'Cascata', true),
  ('b0f3dbf6-2842-54a5-82c1-f55f2ec64244', 'reacao', 'Reação', true)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, active = true;

-- Boca Calada (34)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('df12aaa0-979a-5271-8e9e-c0d144f535d8', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica sério durante 60s enquanto o grupo tenta fazer-te rir.', 'leve', true, false, NULL, NULL),
  ('1f7068fb-d252-5b3b-8363-5a4e9d14204d', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Não podes falar até ser a tua próxima vez. Falas = perdes vida.', 'leve', true, false, NULL, NULL),
  ('75e76eca-7231-5a7b-8a60-7cc71265ccab', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Aguenta 30s a olhar nos olhos do jogador à tua direita sem rir.', 'leve', true, false, NULL, NULL),
  ('8a8b4202-2622-5baf-84f0-1ae204c85f1d', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Só podes responder por gestos até ao fim da ronda.', 'leve', true, false, NULL, NULL),
  ('813311b4-39f1-5d48-884a-07a69fdc5c2d', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Mantém a cara séria enquanto o grupo conta a piada mais má que souber.', 'leve', true, false, NULL, NULL),
  ('bddddba7-a035-581e-8064-5a5cd6eab91a', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica calado e imita a expressão de quem estiver a falar contigo.', 'leve', true, false, NULL, NULL),
  ('7e0f74ca-0ab2-5108-866f-9ab279ae4426', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Aguenta sem sorrir enquanto todos dizem o teu nome em tom ridículo.', 'leve', true, false, NULL, NULL),
  ('fb968d20-f026-53c6-8b08-8a0d754b911c', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Não podes dizer "sim" nem "não" durante duas rondas.', 'leve', true, false, NULL, NULL),
  ('27cbadd6-2c11-56e0-8448-42882e91dacb', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica sério enquanto o grupo faz sons de animais à tua volta.', 'leve', true, false, NULL, NULL),
  ('0d765131-a406-587c-8e35-b706b6a545bf', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Mantém a boca fechada durante 45s enquanto te fazem cócegas com o olhar.', 'leve', true, false, NULL, NULL),
  ('08c360c8-73fe-53bf-82fe-4351c159c521', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Aguenta sem rir enquanto alguém te elogia exageradamente.', 'leve', true, false, NULL, NULL),
  ('8943efc1-fc01-5e12-8cff-7788b8f954b5', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica sério enquanto o grupo reencena o teu momento mais embaraçoso.', 'picante', true, false, NULL, NULL),
  ('424336c7-03e5-5154-832d-2f2b9b6bc8bc', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Não podes rir enquanto contam a história mais constrangedora sobre ti.', 'picante', true, false, NULL, NULL),
  ('384d94f2-bcae-58fe-87d2-8cbdc6a15799', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Aguenta sério enquanto o teu crush do grupo (se houver) te faz olhinhos.', 'picante', true, false, NULL, NULL),
  ('dcc5017f-468a-5fa7-8a39-cdddf4b1d43b', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica calado enquanto o grupo vota se és bom ou mau a beijar.', 'picante', true, false, NULL, NULL),
  ('d2d32f2a-9210-5db7-8963-c7763aba11bd', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Mantém a pose enquanto alguém imita como ficas depois de uns copos.', 'picante', true, false, NULL, NULL),
  ('36d540c4-7522-59e5-8437-00568a2ab789', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Não podes reagir enquanto leem em voz alta a tua última mensagem enviada.', 'picante', true, false, NULL, NULL),
  ('4ddd467a-b865-5d7f-80d2-dc83632dab27', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica sério enquanto o grupo descreve o teu tipo ideal.', 'picante', true, false, NULL, NULL),
  ('da1377f8-7e44-545f-8837-4d4ca77b637d', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Aguenta sem rir enquanto fazem uma imitação tua a paquerar.', 'picante', true, false, NULL, NULL),
  ('1f2be3c6-d7aa-5370-84d0-71addb22d5c7', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Não podes falar enquanto respondes por gestos "o que farias numa primeira noite".', 'picante', true, false, NULL, NULL),
  ('7fe64d2a-6cc9-52f6-82b2-6f8b553bfd25', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Mantém a cara séria enquanto o grupo adivinha o teu segredo mais picante.', 'picante', true, false, NULL, NULL),
  ('78e4a9b4-29b5-5e7b-857c-462e924cd227', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica calado enquanto dois jogadores discutem quem gosta mais de ti.', 'picante', true, false, NULL, NULL),
  ('574de381-27de-5ffe-8f5b-c00790ad6fbe', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Mantém a cara séria enquanto o grupo diz em voz alta o teu "tipo" na cama.', 'hardcore', true, false, NULL, NULL),
  ('7c415c9a-3bc3-534e-8ae9-61991584042c', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Aguenta sem reagir enquanto leem a tua conversa mais picante do telemóvel.', 'hardcore', true, false, NULL, NULL),
  ('7cfc9628-8a4a-583e-8e06-12eafaf143db', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica sério enquanto o grupo vota quem levarias para casa esta noite.', 'hardcore', true, false, NULL, NULL),
  ('96ee0079-3c62-5751-881c-cccca5269550', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Não podes rir enquanto alguém recria o teu pior fora da noite.', 'hardcore', true, false, NULL, NULL),
  ('261e9265-73f1-5522-8017-c110f23c3aa4', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Mantém a pose enquanto descrevem o teu momento mais +18 conhecido.', 'hardcore', true, false, NULL, NULL),
  ('36ae65d3-1968-52ab-8f77-76ed784c92ab', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica calado enquanto o grupo adivinha a tua fantasia mais secreta.', 'hardcore', true, false, NULL, NULL),
  ('3e9201e3-665d-5eca-86a0-8318c062be7e', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica calado enquanto cada um diz, à vez, uma verdade dura sobre ti.', 'caos', true, false, NULL, NULL),
  ('363eb6f8-c7dc-54b8-8523-e7a59b9ae27d', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Mantém a cara séria enquanto o grupo revela o que já disseram sobre ti nas costas.', 'caos', true, false, NULL, NULL),
  ('830b4d5d-60f2-503b-8935-07a7aa2201d8', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Aguenta sem reagir enquanto dizem quem desta mesa aturam menos — e porquê.', 'caos', true, false, NULL, NULL),
  ('6f22e7d4-7a58-5ff6-8c0b-5679e13a277a', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Não podes falar enquanto expõem a tua maior falha de caráter (segundo o grupo).', 'caos', true, false, NULL, NULL),
  ('b0f84a87-7771-5908-8793-eb9b8fe46fbc', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Fica sério enquanto contam a última vez que ficaste mal na fita à frente deles.', 'caos', true, false, NULL, NULL),
  ('08cb6f0b-8727-5989-8ce7-415f1cf49e4f', 'c6c052d9-c5a9-5575-8eec-842faa169ebd', 'Mantém a pose enquanto o grupo decide se és de confiança ou não.', 'caos', true, false, NULL, NULL)
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Desafio (40)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('55bc5789-e0e8-5a15-8c98-59ced46e4f4f', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Faz a tua melhor imitação de outro jogador; se ninguém adivinhar, bebes.', 'leve', true, false, NULL, NULL),
  ('dc3c31c9-d88e-5cd1-87ea-6af402c109cb', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Fala com sotaque estrangeiro até à tua próxima vez.', 'leve', true, false, NULL, NULL),
  ('1cf5dfc0-94b6-549c-8230-6bfbd2abf2f5', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Liga a um contacto aleatório e canta-lhe os parabéns.', 'leve', true, false, NULL, NULL),
  ('e334a62a-d004-5676-85ab-60f54dd0ed27', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Dança 20 segundos sem música.', 'leve', true, false, NULL, NULL),
  ('cd9377e1-08e9-52cb-8341-014b751f5e9e', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Deixa o jogador à tua esquerda publicar um emoji no teu status.', 'leve', true, false, NULL, NULL),
  ('e9a85185-ac43-5871-8a80-bf0258436dc6', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Faz 10 flexões ou bebes dois copos.', 'leve', true, false, NULL, NULL),
  ('1d5b3042-5371-5d3c-83c5-42b65f44b713', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Fala só a rimar durante a próxima ronda.', 'leve', true, false, NULL, NULL),
  ('111c3829-0b87-556e-84d1-270a3f091038', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Imita um animal até alguém adivinhar qual é.', 'leve', true, false, NULL, NULL),
  ('8d0bd1e7-1be2-51a7-84d8-160ed2ab8a1e', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Deixa o grupo escolher-te uma nova alcunha para o resto do jogo.', 'leve', true, false, NULL, NULL),
  ('75d51fd8-c53f-5edd-8cdc-346f9e28cc15', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Conta uma anedota; se ninguém rir, bebes.', 'leve', true, false, NULL, NULL),
  ('51742861-1659-52d1-8457-a126666c96b6', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Faz uma pose de ginásio e mantém-na 30s.', 'leve', true, false, NULL, NULL),
  ('4d46bea2-18fd-5931-897a-47d0a975ca33', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Envia "estava só a pensar em ti 😊" à terceira conversa do teu WhatsApp.', 'picante', true, false, NULL, NULL),
  ('20ec5e69-c79e-5900-823a-a925320051f9', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Mostra a última foto da tua galeria (sem escolher).', 'picante', true, false, NULL, NULL),
  ('9a1c5943-4232-5a39-8a7f-acb57c399e29', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Deixa o grupo ler a tua última mensagem enviada em voz alta.', 'picante', true, false, NULL, NULL),
  ('61736d82-6646-5f8f-889c-b406e4982d8b', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Descreve o teu pior encontro em três frases.', 'picante', true, false, NULL, NULL),
  ('6d8caee4-dd8c-5bd2-825b-96ae6d1f1bd3', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Deixa o jogador à tua direita escrever um story teu por 15s.', 'picante', true, false, NULL, NULL),
  ('6e835630-faf4-5831-84a0-61dd64a2fe70', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Troca uma peça de roupa com o jogador ao teu lado.', 'picante', true, false, NULL, NULL),
  ('c719b3b6-0f73-5e76-852f-f653bf8c3574', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Faz uma serenata improvisada a quem o grupo escolher.', 'picante', true, false, NULL, NULL),
  ('d23f89f9-e1bd-5c3c-83e9-0e4dffee7f0a', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Confessa qual foi a maior mentira que disseste neste grupo.', 'picante', true, false, NULL, NULL),
  ('b2b1ae28-2452-5008-8af4-1b23b122f07d', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Deixa o grupo ver quantas conversas tens fixadas — sem abrir.', 'picante', true, false, NULL, NULL),
  ('20fbede0-e7cc-50d1-8680-086fb97b0563', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Recria o teu melhor movimento de dança "de fim de noite".', 'picante', true, false, NULL, NULL),
  ('a5394117-c509-56d1-8279-b2ff1c65705b', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Manda uma nota de voz a cantar para o último contacto com quem falaste.', 'picante', true, false, NULL, NULL),
  ('564b044b-77ab-5a6b-8296-c516d4dae437', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Liga a um ex e diz "ainda penso em ti" durante 10s — ou bebes 3.', 'hardcore', true, false, NULL, NULL),
  ('dddda955-1559-5168-83d1-fcdbbbd7c127', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Mostra a última foto que enviaste a alguém depois da meia-noite.', 'hardcore', true, false, NULL, NULL),
  ('a390588c-3fae-50a0-8b5a-60867d3f3f64', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Deixa o grupo ler a tua conversa mais recente, sem apagar nada.', 'hardcore', true, false, NULL, NULL),
  ('995b7cea-0d0b-5673-82f2-7ff5f17b0293', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Diz o nome de alguém no grupo com quem terias uma aventura — ou bebes 4.', 'hardcore', true, false, NULL, NULL),
  ('8f5d5142-4239-58a5-8888-09e4b0a171ad', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Descreve o teu momento mais +18 em três palavras.', 'hardcore', true, false, NULL, NULL),
  ('f5892888-e923-59a6-808e-19a88e06cc4d', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Deixa o jogador à tua direita publicar um story teu à escolha dele.', 'hardcore', true, false, NULL, NULL),
  ('494a4711-f01b-5962-8f80-8fc7a6ef9c29', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Qual foi a maior mentira que contaste a alguém desta mesa? Confessa ou bebes 3.', 'caos', true, false, NULL, NULL),
  ('aa5de153-ec31-5cc0-8854-b45d7311ca1d', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Diz qual das pessoas aqui já te irritou a sério — e porquê. Ou bebes 4.', 'caos', true, false, NULL, NULL),
  ('b960867f-3f50-5f85-8366-cf86b520495e', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Confessa a última vez que falaste de alguém desta mesa nas costas.', 'caos', true, false, NULL, NULL),
  ('950ddcba-6380-5cb0-8e30-1b7b8661d328', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Ordena as pessoas da mesa de quem confias mais para quem confias menos, em voz alta.', 'caos', true, false, NULL, NULL),
  ('4de489ba-083b-5f34-8f61-7446c764c565', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Diz a coisa que mudarias em cada pessoa à tua esquerda e à tua direita.', 'caos', true, false, NULL, NULL),
  ('8deddc13-609c-55d4-82e1-eb3b0d3e246e', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Revela um crush passado ou presente por alguém desta mesa — ou bebes 5.', 'caos', true, false, NULL, NULL),
  ('803f9111-41c3-5427-8947-da256b0b4464', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Escolhe um buddy: até à tua próxima vez, sempre que bebes, ele/ela bebe também.', 'leve', true, true, NULL, NULL),
  ('e67fcdb9-f851-5492-855a-b289382317fb', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Escolhe o teu buddy da desgraça — bebem sempre em dobro, juntos, nesta ronda.', 'picante', true, true, NULL, NULL),
  ('113f2e85-ec00-5bf0-8199-42bc558b9b38', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Até às próximas 2 jogadas, tens de rimar sempre que falas — senão bebes.', 'leve', true, false, 2, NULL),
  ('73736c4d-98ef-5b42-8cc9-a04713ef8276', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Nas próximas 2 jogadas, só podes falar na terceira pessoa — senão bebes.', 'leve', true, false, 2, NULL),
  ('35119aca-a985-5c30-8a7e-0de10d805e17', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Nas próximas 3 jogadas, acaba cada frase com "meu capitão" — senão bebes.', 'leve', true, false, 3, NULL),
  ('acb9f9c8-7413-5cbe-8586-e4ca39648a64', 'b77b4756-e507-59c5-8a10-d327f455bedd', 'Até às próximas 2 jogadas, não podes dizer "sim" nem "não" — senão bebes.', 'picante', true, false, 2, NULL)
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Isto ou Aquilo (13)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('b58c7334-0a4b-5d12-863e-5bd288c6930e', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Fazer o pino durante 10s||Imitar um animal até alguém adivinhar', 'leve', true, false, NULL, NULL),
  ('4f1fbc11-19f7-5ec3-8925-a9232289dc5b', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Cantar o refrão da tua música favorita||Dançar 15s sem música', 'leve', true, false, NULL, NULL),
  ('e488f84d-8a50-5893-8b8a-2cfcd0d4f6e6', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Contar uma anedota; se ninguém rir, bebes 2||Beber 2 golos já', 'leve', true, false, NULL, NULL),
  ('6e7791cf-a69e-5bbe-8aa0-10eb61262cc5', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Falar com sotaque até à tua próxima vez||Trocar de lugar com alguém', 'leve', true, false, NULL, NULL),
  ('6b21aa21-6d10-573f-8a48-9ae312bf912e', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Deixar o grupo escolher-te uma alcunha||Fazer 10 flexões', 'leve', true, false, NULL, NULL),
  ('2cbf9944-cd24-5d51-8fb1-4950765dffa4', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Beber 3 golos||Mostrar a última foto da galeria (sem escolher)', 'picante', true, false, NULL, NULL),
  ('d5d36c16-dc5a-51e1-8fb3-e30bdc041e33', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Mandar "estava a pensar em ti 😊" à 3.ª conversa||Beber 4 golos', 'picante', true, false, NULL, NULL),
  ('1443e58f-36ff-554c-8e69-b5d9331ed8f4', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Deixar o grupo ler a tua última mensagem enviada||Beber 3 golos', 'picante', true, false, NULL, NULL),
  ('c1295b49-19b8-5f5c-82bf-435cc4d9e0da', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Beber 2 golos e fazer o pino||Mandar mensagem a alguém com quem já te relacionaste', 'hardcore', true, false, NULL, NULL),
  ('db9f4e83-0dd3-51f9-8e0f-a552767a8990', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Revelar o teu crush do grupo||Beber 5 golos', 'hardcore', true, false, NULL, NULL),
  ('a6e9cbb4-ce7a-5836-8404-6b68b73affde', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Ligar a um ex e falar 10s||Beber 5 golos', 'hardcore', true, false, NULL, NULL),
  ('3c40267f-d6f2-51d5-8386-ee77f160e647', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Dizer o que achas mesmo de quem está à tua frente||Beber 5 golos', 'caos', true, false, NULL, NULL),
  ('18bad67d-49db-52ed-8d13-ab4fb937296f', 'a0c572ec-62e9-5d27-8dff-d2531aad7d4d', 'Confessar a maior mentira que disseste a alguém da mesa||Beber 4 golos', 'caos', true, false, NULL, NULL)
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Intrigas (34)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('344de5a0-ec54-5168-8bd1-2e42690e1987', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é mais capaz de adormecer numa festa? O grupo vota.', 'leve', true, false, NULL, NULL),
  ('404adb02-c70e-577b-87de-2f7f3c03ccfd', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem chega sempre atrasado? Votem.', 'leve', true, false, NULL, NULL),
  ('b5899860-cbac-5a96-8803-f5b9bfffae20', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem tem o pior gosto musical? Votação.', 'leve', true, false, NULL, NULL),
  ('9fe09f50-a2c6-5d3b-8e2e-e941a51eeff2', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é mais provável de perder o telemóvel esta noite?', 'leve', true, false, NULL, NULL),
  ('e0bfce0a-92f2-5cc4-8121-330338dfe802', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem fala mais alto quando bebe?', 'leve', true, false, NULL, NULL),
  ('abb18665-30d8-5b5d-8bb9-82576fa4f887', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem seria o pior a guardar um segredo?', 'leve', true, false, NULL, NULL),
  ('4240056f-537c-51c5-842a-354f95b3319b', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem gasta mais tempo ao espelho?', 'leve', true, false, NULL, NULL),
  ('4955c6a6-f78c-5c8f-8d63-79161f68fe01', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é mais capaz de comer o que sobra no prato dos outros?', 'leve', true, false, NULL, NULL),
  ('33897062-deb6-52a1-8f88-969177efe2b9', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem seria o primeiro a fugir num filme de terror?', 'leve', true, false, NULL, NULL),
  ('331f541a-c4cb-5cc9-82df-086a8dfdcb18', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem tem sempre a desculpa mais criativa para faltar?', 'leve', true, false, NULL, NULL),
  ('9e0006dc-70e2-5649-8da7-8f5c07925ee5', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é o mais dramático do grupo?', 'leve', true, false, NULL, NULL),
  ('2f9091c3-452b-5df0-8390-dc3759b2c819', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é mais provável de mandar mensagem ao ex a meio da noite?', 'picante', true, false, NULL, NULL),
  ('1ae14097-29a0-5370-81c4-f3a9778c04fc', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem já teve a maior queda por alguém deste grupo?', 'picante', true, false, NULL, NULL),
  ('26b46d24-5fd7-5793-8d5c-60d3885b688b', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é mais capaz de beijar um desconhecido numa saída?', 'picante', true, false, NULL, NULL),
  ('bf0ac544-d520-56bb-8a86-877a687d230d', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem tem mais probabilidade de ter um crush secreto agora mesmo?', 'picante', true, false, NULL, NULL),
  ('59d4f989-823c-5ef1-82d2-09cb01ebb453', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem seria o mais atrevido num jogo de verdade ou consequência?', 'picante', true, false, NULL, NULL),
  ('9e077312-4c3a-5c44-846f-20cbe9c560f0', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem já flirtou para não pagar a conta?', 'picante', true, false, NULL, NULL),
  ('37e2d131-4de9-5137-82b7-4ce875298aa0', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é mais provável de se apaixonar em férias?', 'picante', true, false, NULL, NULL),
  ('2a3e983c-bd8e-5629-896b-91f35f8aed71', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem tem o histórico de encontros mais caótico?', 'picante', true, false, NULL, NULL),
  ('d53aab7b-cdca-5213-8e1d-140f6dacd588', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem seria o primeiro a dizer "eu amo-te" cedo demais?', 'picante', true, false, NULL, NULL),
  ('412982ec-f437-5a93-8db4-c06c16a9d5ed', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é mais capaz de dar o número falso a alguém?', 'picante', true, false, NULL, NULL),
  ('99457a47-8841-5f6b-8cec-1553e2d0eeb2', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem tem a maior probabilidade de acabar a noite a dançar em cima da mesa?', 'picante', true, false, NULL, NULL),
  ('e1b845b0-3d73-579d-870e-afce10561296', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem do grupo já teve a noite mais louca? Votem.', 'hardcore', true, false, NULL, NULL),
  ('79210f14-e1ed-5a92-828b-de3d003adbe1', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é mais capaz de dar uns beijos a um desconhecido hoje?', 'hardcore', true, false, NULL, NULL),
  ('19748752-5d18-5127-8ce9-0b5308506726', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem tem o histórico mais caótico de mensagens a horas tardias?', 'hardcore', true, false, NULL, NULL),
  ('ea8af3fd-4226-5ad2-8856-0b07b9731058', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem seria o mais atrevido debaixo dos lençóis?', 'hardcore', true, false, NULL, NULL),
  ('a1aab889-7137-5dbf-842a-30b2ab8e5a9f', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem já ficou (ou quase) com alguém deste grupo?', 'hardcore', true, false, NULL, NULL),
  ('b3b8d1ae-80e5-5c86-819a-f933a60afde4', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é mais provável de acabar a noite acompanhado/a?', 'hardcore', true, false, NULL, NULL),
  ('e6cc10ff-b947-54f9-8b45-33caa8486e46', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem nesta mesa é mais falso? O grupo decide.', 'caos', true, false, NULL, NULL),
  ('48a6282a-ee5c-571d-856f-467b95336d4d', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem já falou mal de mais gente aqui presente?', 'caos', true, false, NULL, NULL),
  ('c37edf3e-6bad-52a6-8dc5-acf1b1ec1cd6', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Em quem confias menos para guardar um segredo teu?', 'caos', true, false, NULL, NULL),
  ('7a1dc116-9d37-5ad2-8537-897aa5146c99', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem é mais provável de andar a namoriscar alguém do grupo às escondidas?', 'caos', true, false, NULL, NULL),
  ('9eaf2517-f94a-5dda-823c-f76e924606b8', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem seria o primeiro a trair o grupo por interesse próprio?', 'caos', true, false, NULL, NULL),
  ('d4c9862f-8841-5255-8bb7-6b5b2259e098', '5df71400-28e5-50f0-805a-2df1591cf6df', 'Quem aqui já gostou de alguém do grupo e nunca admitiu?', 'caos', true, false, NULL, NULL)
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Segredos Anónimos (34)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('535ebfb5-d7ce-53c4-857c-00b68d345544', '157382b6-9786-5855-854d-7729b00394e2', 'Submete um segredo sobre a tua infância. O grupo adivinha de quem é.', 'leve', true, false, NULL, NULL),
  ('4eb2ba5b-789a-564d-8049-a898873d66fd', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa anonimamente um medo estranho que tenhas.', 'leve', true, false, NULL, NULL),
  ('d007d535-6fc3-5e86-8e19-10491bd9c2c0', '157382b6-9786-5855-854d-7729b00394e2', 'Partilha a coisa mais infantil que ainda fazes.', 'leve', true, false, NULL, NULL),
  ('589aa97e-8aaf-58ed-8256-226c600b6502', '157382b6-9786-5855-854d-7729b00394e2', 'Escreve um talento escondido que ninguém aqui conhece.', 'leve', true, false, NULL, NULL),
  ('b7e1d581-8265-5fab-814b-81c2d602e170', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa um hábito esquisito que tens quando estás sozinho/a.', 'leve', true, false, NULL, NULL),
  ('f999bca6-2953-5ac1-86a5-f16ba83caeab', '157382b6-9786-5855-854d-7729b00394e2', 'Partilha a compra mais inútil que já fizeste.', 'leve', true, false, NULL, NULL),
  ('caa16b79-2287-568f-88ae-16b0094b944a', '157382b6-9786-5855-854d-7729b00394e2', 'Escreve algo por que já choraste a ver um filme.', 'leve', true, false, NULL, NULL),
  ('56c4fb54-016d-560a-899e-0277af94bd33', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa uma mentira inofensiva que dizes com frequência.', 'leve', true, false, NULL, NULL),
  ('27de8e0b-8abe-56a7-843f-06a0ba8324a4', '157382b6-9786-5855-854d-7729b00394e2', 'Partilha o prato que finges gostar mas odeias.', 'leve', true, false, NULL, NULL),
  ('4f03bf55-1289-51e6-8a69-b0a1d1ed828e', '157382b6-9786-5855-854d-7729b00394e2', 'Escreve a coisa mais embaraçosa que tens no histórico de pesquisa.', 'leve', true, false, NULL, NULL),
  ('4db8bc56-4973-5010-837a-5e8696f784e9', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa uma manha que usas para faltar a compromissos.', 'leve', true, false, NULL, NULL),
  ('1a9d2173-cd54-5266-8e98-11a8434fce3a', '157382b6-9786-5855-854d-7729b00394e2', 'Partilha um segredo sobre a tua vida amorosa. O grupo adivinha de quem é.', 'picante', true, false, NULL, NULL),
  ('40d68a0c-af71-5162-8873-a8f1c45f09e5', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa anonimamente o teu maior arrependimento romântico.', 'picante', true, false, NULL, NULL),
  ('0ca1ca17-123c-58e4-8daa-3c8c544efe51', '157382b6-9786-5855-854d-7729b00394e2', 'Escreve o sítio mais inusitado onde já deste um beijo.', 'picante', true, false, NULL, NULL),
  ('1115e3c8-bbe3-5a7c-826e-9a277fa584a5', '157382b6-9786-5855-854d-7729b00394e2', 'Partilha algo que nunca contaste a ninguém deste grupo.', 'picante', true, false, NULL, NULL),
  ('9a1e05ba-dc5d-5683-8276-152fa9164835', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa se já tiveste um crush em alguém presente (sem dizer quem).', 'picante', true, false, NULL, NULL),
  ('c0e114a4-e6c2-554a-899b-16169feac103', '157382b6-9786-5855-854d-7729b00394e2', 'Escreve a mensagem mais atrevida que já enviaste.', 'picante', true, false, NULL, NULL),
  ('3fc38c45-b145-51ad-8533-3fb059149d47', '157382b6-9786-5855-854d-7729b00394e2', 'Partilha o encontro mais louco que já tiveste.', 'picante', true, false, NULL, NULL),
  ('7737a6b2-cf14-551f-8a05-3297eec68e2a', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa uma paixoneta secreta por alguém famoso improvável.', 'picante', true, false, NULL, NULL),
  ('3bc54501-fbb2-5059-8c1b-1ee170cbfa7b', '157382b6-9786-5855-854d-7729b00394e2', 'Escreve algo de que te arrependes de ter feito numa festa.', 'picante', true, false, NULL, NULL),
  ('71d331ec-c45a-5299-85ea-d499dc8e9ebf', '157382b6-9786-5855-854d-7729b00394e2', 'Partilha a desculpa mais dramática que já deste para acabar um encontro.', 'picante', true, false, NULL, NULL),
  ('296f2066-6b7f-58a6-8160-9c36a569ce6b', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa o segredo que levarias para o túmulo... até agora.', 'picante', true, false, NULL, NULL),
  ('a793201e-a06d-5492-88d1-762355526ced', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa anonimamente a tua fantasia mais inconfessável.', 'hardcore', true, false, NULL, NULL),
  ('1bacd5e0-4135-5aff-8d1f-6a2de6757283', '157382b6-9786-5855-854d-7729b00394e2', 'Escreve o sítio mais arriscado onde já foste longe demais.', 'hardcore', true, false, NULL, NULL),
  ('e4f15a39-23bb-5de8-81d2-974ae4491e2f', '157382b6-9786-5855-854d-7729b00394e2', 'Partilha o segredo +18 que nunca contaste a ninguém.', 'hardcore', true, false, NULL, NULL),
  ('6ae6d609-ebcb-50a3-8682-9e93ca4a2aed', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa se já tiveste algo com alguém presente — sem dizer quem.', 'hardcore', true, false, NULL, NULL),
  ('7d88560a-f13d-5296-8547-59503375eaf2', '157382b6-9786-5855-854d-7729b00394e2', 'Escreve a coisa mais atrevida que já fizeste sóbrio/a.', 'hardcore', true, false, NULL, NULL),
  ('cbc950de-b72b-5d28-83d3-491f1600f80d', '157382b6-9786-5855-854d-7729b00394e2', 'Partilha o teu maior arrependimento de uma noite de festa.', 'hardcore', true, false, NULL, NULL),
  ('26ef683e-a4bf-531e-84f3-f67620bb37eb', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa (anónimo) a maior mentira que já disseste a alguém desta mesa.', 'caos', true, false, NULL, NULL),
  ('64eab4dd-a844-529f-81a2-2b4543b9e12f', '157382b6-9786-5855-854d-7729b00394e2', 'Escreve o que realmente sentiste da última vez que discutiste com alguém aqui.', 'caos', true, false, NULL, NULL),
  ('c321a67c-123e-5581-867f-17617f5ecdeb', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa se já perdeste o respeito por alguém do grupo — sem dizer quem.', 'caos', true, false, NULL, NULL),
  ('1e302e11-8a86-5b02-85e9-8acf7f42c095', '157382b6-9786-5855-854d-7729b00394e2', 'Partilha a coisa mais dramática que já fizeste por causa de alguém desta mesa.', 'caos', true, false, NULL, NULL),
  ('c4c3d320-521b-5bbd-8159-b25d2dfeb7a0', '157382b6-9786-5855-854d-7729b00394e2', 'Escreve um arrependimento que tens com alguém presente.', 'caos', true, false, NULL, NULL),
  ('dc2094f2-ab6e-5096-8d40-de0be9dc5fcf', '157382b6-9786-5855-854d-7729b00394e2', 'Confessa se alguma vez fingiste gostar de alguém do grupo.', 'caos', true, false, NULL, NULL)
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Piramide: sem prompts (mecânica pura — o conteúdo é gerado pelo motor).

-- Jogo do Vasco: sem prompts (mecânica pura — o conteúdo é gerado pelo motor).

-- Categoria Relâmpago (26)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('5c5e113d-813b-544c-8d28-71b0779878c4', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Marcas de cerveja', 'leve', true, false, NULL, NULL),
  ('079e93d2-03f3-579a-8b43-c62777b11603', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Equipas da Primeira Liga', 'leve', true, false, NULL, NULL),
  ('048ed316-7207-56f7-8afe-7a38c0944cef', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Pratos portugueses', 'leve', true, false, NULL, NULL),
  ('3afe07c0-e39f-5a9c-8f0e-c924d4501735', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Cidades de Portugal', 'leve', true, false, NULL, NULL),
  ('ff365f76-b8c2-5220-829c-6bf2a7a9d57b', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Marcas de carros', 'leve', true, false, NULL, NULL),
  ('a06eff1e-5453-5bdd-8cc9-f5e78ba60726', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Animais com quatro patas', 'leve', true, false, NULL, NULL),
  ('0b9d7c49-c555-5627-8420-a3a0f69a8da2', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Coisas que há numa cozinha', 'leve', true, false, NULL, NULL),
  ('bc51de1f-8918-5a9b-805b-b47fbc3f9fcf', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Cantores portugueses', 'leve', true, false, NULL, NULL),
  ('ca0d6046-5d75-54fd-874d-cab2bbb0bf0c', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Doces de pastelaria', 'leve', true, false, NULL, NULL),
  ('4e343663-f899-5fa9-86f5-581c5ad1b8c8', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Programas de televisão portugueses', 'leve', true, false, NULL, NULL),
  ('5ca8a25b-1c09-518f-89b5-0eacfc592637', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Peças de roupa', 'leve', true, false, NULL, NULL),
  ('b6648fd0-b866-5c45-8773-00288ad5ab25', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Desculpas para chegar atrasado', 'leve', true, false, NULL, NULL),
  ('8a0fe04d-1ffc-5c6b-8386-13cf0a8bd01b', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Bebidas que se pedem num bar', 'picante', true, false, NULL, NULL),
  ('57c0f899-768b-58ee-8d49-2715cea31023', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Sítios inusitados para dar um beijo', 'picante', true, false, NULL, NULL),
  ('3a5fe631-b0f7-5cd4-8194-04a6307bee62', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Coisas que se dizem numa paquera', 'picante', true, false, NULL, NULL),
  ('52827c12-2334-5434-8953-7570147aea26', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Apps de encontros', 'picante', true, false, NULL, NULL),
  ('752a4a4a-3c95-5db2-8094-e7371ea31eec', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Desculpas para não ir a um segundo encontro', 'picante', true, false, NULL, NULL),
  ('742208ff-487d-5d5d-82bb-dc719eafea9e', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Ressacas: o que se faz no dia seguinte', 'picante', true, false, NULL, NULL),
  ('175b48a4-8ff0-5342-8eeb-f4f4db3f273a', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Partes do corpo', 'hardcore', true, false, NULL, NULL),
  ('5c3fe70a-10a6-5948-8c3b-d29c5724bc12', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Coisas que nunca dirias aos teus pais', 'hardcore', true, false, NULL, NULL),
  ('b7938227-279c-5f25-86d2-473971e1b0a3', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Palavrões que já disseste hoje', 'hardcore', true, false, NULL, NULL),
  ('949061bf-34bc-565c-88e4-fee19f6bb78f', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Sítios onde já foste longe demais', 'hardcore', true, false, NULL, NULL),
  ('9aef2dab-3c34-5c17-8cec-72989e647499', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Motivos para acabar uma relação', 'caos', true, false, NULL, NULL),
  ('86bdb50c-5931-5f7f-8d0c-df71b90e439a', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Defeitos que toda a gente tem', 'caos', true, false, NULL, NULL),
  ('79875a84-2176-557a-84e2-b6cae24f452c', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Coisas que se dizem quando se fala mal de alguém', 'caos', true, false, NULL, NULL),
  ('1b4e9b55-4036-5c70-8e91-96eceda8974d', '9cfe05ca-3ec5-528f-84ac-e9b6ce8ebd03', 'Mentiras que já contaste a este grupo', 'caos', true, false, NULL, NULL)
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Mímica (30)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('2ab84760-33ce-53dc-8d9b-df4c2a7b5e31', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Ressaca', 'leve', true, false, NULL, NULL),
  ('0223354f-3a23-51c4-84ed-706b4a5e6f48', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Karaoke', 'leve', true, false, NULL, NULL),
  ('9dca6edd-ed8a-57ce-8b05-2513f33c005b', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Selfie', 'leve', true, false, NULL, NULL),
  ('dccde342-2760-5871-8c1e-3917a344aa83', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Guarda-redes', 'leve', true, false, NULL, NULL),
  ('80e60314-1d31-53d5-86c3-795c11f200e0', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Churrasco', 'leve', true, false, NULL, NULL),
  ('898f11bd-6e25-5457-8d85-3e38da3585aa', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Autocarro cheio', 'leve', true, false, NULL, NULL),
  ('363a763a-7b01-57cc-8d83-cca0511964dc', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Bolo de aniversário', 'leve', true, false, NULL, NULL),
  ('758d634b-90b0-59db-8432-1d59aa45ab4c', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Praia ao vento', 'leve', true, false, NULL, NULL),
  ('a43b40f2-5b98-5f3f-8aad-66c0cc3f95f0', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Dentista', 'leve', true, false, NULL, NULL),
  ('27a2b9f6-fb60-5511-82ad-8c94d1d2320b', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Vaca', 'leve', true, false, NULL, NULL),
  ('2f8b2819-bc77-54a5-817f-ba4b1f86b455', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Trânsito na ponte', 'leve', true, false, NULL, NULL),
  ('b59d7237-14a9-5567-8358-5524077a4e46', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Mergulho', 'leve', true, false, NULL, NULL),
  ('844ddd5c-6227-53a1-8a59-c306e7835f93', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Cair na rua', 'leve', true, false, NULL, NULL),
  ('2fa398fb-c94a-5884-8614-fe76e08adcbb', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Ganhar a lotaria', 'leve', true, false, NULL, NULL),
  ('887c3e09-a460-50b5-865c-df0488ca5de4', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Primeiro encontro', 'picante', true, false, NULL, NULL),
  ('f0b4701c-7cfc-57c1-8cad-b8843271d027', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Dança sensual', 'picante', true, false, NULL, NULL),
  ('0d5d5ede-3915-596d-8a3a-d16f4f3fe711', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Beijo à francesa', 'picante', true, false, NULL, NULL),
  ('952cac30-20e8-534d-8e4c-9df84d445a13', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Bêbado a cantar', 'picante', true, false, NULL, NULL),
  ('29e2bb2b-aa06-5149-8d6a-e9022e1e0e9d', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Story embaraçoso', 'picante', true, false, NULL, NULL),
  ('7ff81228-9929-5447-8c32-0ce94184c0d3', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Cantada foleira', 'picante', true, false, NULL, NULL),
  ('0d04fd34-9ab5-55e3-8487-061df38d69ba', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Discussão de casal', 'picante', true, false, NULL, NULL),
  ('06636e56-e247-5ba1-874f-c15640b52f3e', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Fugir do encontro', 'picante', true, false, NULL, NULL),
  ('46caf9ec-3117-5599-877e-cb388eeb81c1', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Pedido de casamento falhado', 'hardcore', true, false, NULL, NULL),
  ('c5ad98d2-45fa-53c5-8ca8-55a245bd4c99', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Apanhado pelos pais', 'hardcore', true, false, NULL, NULL),
  ('680ff987-0da4-5b1b-8ad7-002c7d7ed342', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Mensagem para o ex às 3 da manhã', 'hardcore', true, false, NULL, NULL),
  ('29539a5e-b541-5263-8104-5d2f6d891c51', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Strip improvisado', 'hardcore', true, false, NULL, NULL),
  ('90561390-35dd-5b37-8474-0831a6c64ee5', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Traição descoberta', 'caos', true, false, NULL, NULL),
  ('95f7201f-7a71-5956-81b6-cf510848eef2', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Falar mal de alguém pelas costas', 'caos', true, false, NULL, NULL),
  ('509dba96-7101-5ec5-8bea-c55ef02eb935', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Drama de grupo no WhatsApp', 'caos', true, false, NULL, NULL),
  ('e6461da7-9b02-5555-8a9f-0cd3f498a345', '4e111c07-99ef-5c19-8dd3-4f89849feb59', 'Bloquear alguém nas redes', 'caos', true, false, NULL, NULL)
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Roleta Russa (26)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('22fdaaf3-99dd-50dd-8736-b0f8b90291ff', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual foi a maior vergonha que já passaste em público?', 'leve', true, false, NULL, NULL),
  ('267e7974-8469-5cc1-85a3-cb5b43c0b017', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual é a coisa mais infantil que ainda fazes?', 'leve', true, false, NULL, NULL),
  ('c67204c1-1318-53ee-8b55-761d855e8217', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual é a mentira mais parva que já contaste?', 'leve', true, false, NULL, NULL),
  ('0882f48b-9797-5440-88b1-8d65e08da4f4', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual é o teu maior medo ridículo?', 'leve', true, false, NULL, NULL),
  ('ecea9de1-3e03-580b-85c1-795aa4e4163c', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'O que tens no histórico de pesquisa que não mostrarias?', 'leve', true, false, NULL, NULL),
  ('0455492c-4688-5185-83d7-fb4f937b2dcb', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual foi a pior prenda que já deste a alguém?', 'leve', true, false, NULL, NULL),
  ('e3aea0aa-9c2d-5dac-8062-f21202dcf577', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual é o hábito mais nojento que tens quando ninguém vê?', 'leve', true, false, NULL, NULL),
  ('d85524e5-821b-52f7-8e23-40e32cc0f9e2', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual foi a última vez que choraste — e porquê?', 'leve', true, false, NULL, NULL),
  ('0845da15-e3ae-5383-8976-80e53635bbe4', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Quem foi o teu pior beijo e porquê?', 'picante', true, false, NULL, NULL),
  ('48a6be8f-4ef0-54a0-882b-1adf5b02bdc6', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual foi o encontro mais desastroso da tua vida?', 'picante', true, false, NULL, NULL),
  ('31686027-f906-53fd-80c9-24627db267a4', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Já enviaste mensagem à pessoa errada? O que dizia?', 'picante', true, false, NULL, NULL),
  ('732e1a83-e074-5944-8236-fc72fa4ce88e', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual é a coisa mais atrevida que já fizeste sóbrio/a?', 'picante', true, false, NULL, NULL),
  ('c2fa3ddb-0fd9-5163-80b0-53cbd1fb0b42', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Já ficaste com alguém e te arrependeste na hora?', 'picante', true, false, NULL, NULL),
  ('1fc70a9d-d051-5cc9-8e4c-f1f0c77a0b9a', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual é o teu maior arrependimento romântico?', 'picante', true, false, NULL, NULL),
  ('90242aa0-dcd9-5cc5-8151-a1a0f0a9523f', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Já stalkeaste alguém a sério nas redes? Quem?', 'picante', true, false, NULL, NULL),
  ('b4bf65ca-9d60-50b7-8bcd-b667ea80d28c', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Quantas pessoas desta mesa já achaste atraentes?', 'picante', true, false, NULL, NULL),
  ('1f9dee17-5587-583f-8e1d-e8a780189430', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual é a tua fantasia mais inconfessável?', 'hardcore', true, false, NULL, NULL),
  ('b12a7d7d-730e-5a9d-825c-4fe194811047', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual foi o sítio mais arriscado onde já foste longe demais?', 'hardcore', true, false, NULL, NULL),
  ('2f3727d6-309a-5529-8dfc-fed78768d93e', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Já tiveste alguma coisa com alguém presente?', 'hardcore', true, false, NULL, NULL),
  ('73b9e2ad-2e0d-5268-82c6-fac142a5f520', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual foi a tua noite mais louca de sempre — sem cortes?', 'hardcore', true, false, NULL, NULL),
  ('fe9864a0-4cf8-545a-82af-881516f4aed1', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'O que farias por mil euros que nunca admitirias aqui?', 'hardcore', true, false, NULL, NULL),
  ('4290d148-25a7-5696-8e94-f562aaec1305', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Qual é a maior mentira que já contaste a alguém desta mesa?', 'caos', true, false, NULL, NULL),
  ('b0149f88-d26e-584e-86c2-af285aff51a2', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'De quem desta mesa já falaste mal — e o que disseste?', 'caos', true, false, NULL, NULL),
  ('0ecee021-4b59-5008-80c2-a739d7ac311a', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Em quem aqui confias menos e porquê?', 'caos', true, false, NULL, NULL),
  ('3325740a-8a45-5748-8a53-4d539075f19d', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Já perdeste o respeito por alguém deste grupo? Porquê?', 'caos', true, false, NULL, NULL),
  ('db978fb0-f7c7-53d9-8992-d97274d152a3', '0d78a196-24c2-5924-83ea-9e6b76d6fb22', 'Que pessoa desta mesa cortarias da tua vida sem pensar?', 'caos', true, false, NULL, NULL)
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Duelo 1v1: sem prompts (mecânica pura — o conteúdo é gerado pelo motor).

-- Eu Nunca (37)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('3ee6e8bb-7881-5b19-87c2-6038efa1344f', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fui apanhado/a a mentir por uma pessoa desta mesa.', 'leve', true, false, NULL, NULL),
  ('641cdb24-614f-5f0a-8cd2-731a6754b6b0', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'cantei no karaoke completamente sóbrio/a.', 'leve', true, false, NULL, NULL),
  ('1d4709af-15f6-52d3-8877-cf031bf411b4', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fingi que sabia uma música só para não ficar mal.', 'leve', true, false, NULL, NULL),
  ('2ecbcf48-c17d-5ec0-8b43-3b0a65fd3000', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'dormi numa festa antes da meia-noite.', 'leve', true, false, NULL, NULL),
  ('1611d789-c28e-5326-8155-3b0047b25b80', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fui a um concerto de um artista que detesto.', 'leve', true, false, NULL, NULL),
  ('002d912f-6472-5757-8d98-99e186827867', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'chorei a ver um filme de animação.', 'leve', true, false, NULL, NULL),
  ('c3e566e1-e591-51ba-827c-21b4f278e9bc', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'dei um like sem querer numa foto de 2015.', 'leve', true, false, NULL, NULL),
  ('a44a7155-0ade-5311-8a5e-9ca84dac8e3f', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'inventei uma doença para faltar ao trabalho ou às aulas.', 'leve', true, false, NULL, NULL),
  ('61cc6640-a7b2-537e-8660-e318fcf09678', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'perdi o telemóvel numa noite e apareceu no dia seguinte.', 'leve', true, false, NULL, NULL),
  ('a55e8c2b-b635-50a0-8003-e0f788ed99dd', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'comi a última fatia sem perguntar a ninguém.', 'leve', true, false, NULL, NULL),
  ('4be3226c-54e0-5b3a-88cf-5a8ef9c774ef', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fui de casa com a roupa do avesso o dia inteiro.', 'leve', true, false, NULL, NULL),
  ('f10969d3-7ed9-5b5b-86f5-52ff48b8d012', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'guardei um número no telemóvel com um nome falso.', 'picante', true, false, NULL, NULL),
  ('c5de5d1f-dbea-52e7-8bdd-ed668324aae9', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'enviei mensagem a um ex depois da meia-noite.', 'picante', true, false, NULL, NULL),
  ('9a270105-bb79-5e23-893a-fddf1d7d7209', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fingi uma chamada para fugir de uma conversa.', 'picante', true, false, NULL, NULL),
  ('8d8a9cf2-beca-563f-87a1-30a751b6e8f8', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'beijei alguém de quem não sabia o nome.', 'picante', true, false, NULL, NULL),
  ('cde8622a-2295-5cca-8b82-80974192b19d', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fui a um encontro só pela comida.', 'picante', true, false, NULL, NULL),
  ('7df6cd04-f07e-57f6-89eb-1178abca89f8', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'stalkei o novo par de um ex durante mais de meia hora.', 'picante', true, false, NULL, NULL),
  ('94d49c57-4040-59d2-846f-57753f0edb87', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'tive um crush por alguém desta mesa.', 'picante', true, false, NULL, NULL),
  ('a5bf4178-ce57-5e45-858b-8e8565fe966b', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'menti sobre onde estava para não ir a um plano.', 'picante', true, false, NULL, NULL),
  ('cfd23791-bb03-504d-852b-5f13953e8a3c', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'saí de uma festa sem me despedir de ninguém.', 'picante', true, false, NULL, NULL),
  ('6dc545b7-4173-5db6-8339-39f1de4e8047', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fiquei com duas pessoas na mesma noite.', 'hardcore', true, false, NULL, NULL),
  ('0e20873f-90f5-5ecf-86f0-309713ed76cc', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'dei um beijo em alguém comprometido.', 'hardcore', true, false, NULL, NULL),
  ('5b1926d3-1ba7-52fa-8163-cbfb790022ff', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fiz algo de que me arrependo mesmo a sério nesta cidade.', 'hardcore', true, false, NULL, NULL),
  ('825b1099-47e6-5da6-8ef6-b697633a9179', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'menti sobre o meu passado a alguém importante.', 'hardcore', true, false, NULL, NULL),
  ('891a5226-7e9d-5739-8eb7-ceba5a90a6ea', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fui longe demais num sítio público.', 'hardcore', true, false, NULL, NULL),
  ('32f8d77e-c459-5d0a-85cf-25b7831475e3', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'bebi tanto que não me lembro de como cheguei a casa.', 'hardcore', true, false, NULL, NULL),
  ('6dacca1d-9370-5b8d-81a0-d971e613224c', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'falei mal de alguém desta mesa nas últimas semanas.', 'caos', true, false, NULL, NULL),
  ('479712de-5c2e-5ba2-8000-10ec975be9d4', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'guardei um segredo que estraga a noite de alguém aqui.', 'caos', true, false, NULL, NULL),
  ('71ad748f-c444-59c8-891b-bd03a7c37a2b', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'já pensei em cortar relações com alguém deste grupo.', 'caos', true, false, NULL, NULL),
  ('71a6dd4e-130f-5b59-8291-61523d6cde5f', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'li mensagens no telemóvel de alguém sem autorização.', 'caos', true, false, NULL, NULL),
  ('57493114-d78d-5dd5-82d7-4c76d99d3688', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'menti a este grupo sobre uma coisa importante.', 'caos', true, false, NULL, NULL),
  ('e15a8f5b-3af9-5329-8aeb-6b00626b30fe', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fui a uma festa de anos sem levar prenda.', 'leve', true, false, NULL, 'aniversario'),
  ('b22fca50-19d6-5530-81e2-308d2462632a', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'esqueci-me do aniversário de alguém muito próximo.', 'leve', true, false, NULL, 'aniversario'),
  ('287fd1ef-a881-5a43-89c6-bc592b6974c7', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'fiz asneira numa despedida de solteiro/a.', 'picante', true, false, NULL, 'despedida'),
  ('888568e1-ec0a-55eb-8fe4-13cedaa1d287', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'perdi alguém de vista numa despedida e só apareceu de manhã.', 'picante', true, false, NULL, 'despedida'),
  ('4e9c931f-c69e-5c79-8edb-06bb34a370ce', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'deixei de falar com alguém deste grupo durante meses.', 'picante', true, false, NULL, 'reencontro'),
  ('21ff2e79-5e64-5a14-8fdc-45b0ce930366', '006d3b95-6cd2-5db6-8141-04faccbfc899', 'mudei completamente de vida sem contar a ninguém aqui.', 'leve', true, false, NULL, 'reencontro')
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Mais Provável (31)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('11397610-d767-5bb6-80ae-5246f8ffbc36', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'adormecer primeiro esta noite', 'leve', true, false, NULL, NULL),
  ('3970c325-6cea-5d83-8bd6-8ebc6112de37', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'perder o telemóvel esta semana', 'leve', true, false, NULL, NULL),
  ('0b29ab06-f817-56d5-8686-b3453b8023e6', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'chegar atrasado a tudo', 'leve', true, false, NULL, NULL),
  ('90bf7154-82f6-5351-8800-54c9ae01a0ce', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'cantar no karaoke sem ninguém pedir', 'leve', true, false, NULL, NULL),
  ('1d264474-72a0-5893-84bf-78545cf4c00a', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'ficar rico sem trabalhar', 'leve', true, false, NULL, NULL),
  ('592f6c0d-4a6f-5902-8945-c1fa73ad1914', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'dar a volta ao mundo sozinho/a', 'leve', true, false, NULL, NULL),
  ('477ea590-26d4-5795-85e9-65baf86d102e', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'comer o jantar de outra pessoa', 'leve', true, false, NULL, NULL),
  ('92301a5f-5006-5d0c-8d31-428644a8d604', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'ter uma coleção secreta estranha', 'leve', true, false, NULL, NULL),
  ('644606a7-a5bd-5f9b-8c00-b8dff208c560', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'discutir com um empregado de mesa', 'leve', true, false, NULL, NULL),
  ('87a5aa1e-7d16-5950-8c8c-8f0025b1aeef', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'emigrar de um dia para o outro', 'leve', true, false, NULL, NULL),
  ('70a57da5-c039-5b23-8e39-5bf6e424f201', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'chorar com um anúncio de Natal', 'leve', true, false, NULL, NULL),
  ('623210cd-c31d-5ae0-8c70-d24a926731a8', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'acabar a noite a comer no chão da cozinha', 'picante', true, false, NULL, NULL),
  ('b2ca3411-f025-5607-8ab1-b63aee57ff90', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'mandar mensagem ao ex esta noite', 'picante', true, false, NULL, NULL),
  ('640d027f-0d31-5b80-8f07-f3f307466b97', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'ficar com alguém à frente de toda a gente', 'picante', true, false, NULL, NULL),
  ('3f44cd51-70ab-5d92-86e9-ba121bc2e435', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'ter uma história que ninguém aqui conhece', 'picante', true, false, NULL, NULL),
  ('13726154-6583-5768-80fe-84d25674bf1f', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'apaixonar-se em 24 horas', 'picante', true, false, NULL, NULL),
  ('38597511-2037-59ce-84d1-35c6dcba4866', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'fugir de um encontro a meio', 'picante', true, false, NULL, NULL),
  ('2f1089f1-d877-5afb-86d1-19268c8f7216', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'dar o número a um desconhecido esta noite', 'picante', true, false, NULL, NULL),
  ('b67881a1-ab5f-54e5-8bd3-04c4aa90fefe', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'acordar num sítio que não reconhece', 'hardcore', true, false, NULL, NULL),
  ('a5fc4fc2-ab71-5a11-8f76-c209a84096c0', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'fazer o maior disparate da noite', 'hardcore', true, false, NULL, NULL),
  ('1799a4c9-03ec-5785-8e32-f245cf1de8da', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'ter mais segredos do que admite', 'hardcore', true, false, NULL, NULL),
  ('63208bfb-b12e-5fef-8503-abc438aa95cd', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'ficar com alguém desta mesa', 'hardcore', true, false, NULL, NULL),
  ('5f7a4f4f-f755-5e0b-803b-ec47c78dff3a', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'fazer algo que dava escândalo se se soubesse', 'hardcore', true, false, NULL, NULL),
  ('51dc59db-d80f-53ef-8b6a-84d50baa0c47', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'falar mal de alguém deste grupo pelas costas', 'caos', true, false, NULL, NULL),
  ('e1fc05ff-ac7d-5630-8b59-ce457d15280c', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'trair a confiança de um amigo', 'caos', true, false, NULL, NULL),
  ('9adf8271-e121-5d4a-8acb-fc399d509c3b', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'começar uma discussão sem razão nenhuma', 'caos', true, false, NULL, NULL),
  ('4a889351-f684-5222-8352-ee34b9872c25', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'guardar rancor durante anos', 'caos', true, false, NULL, NULL),
  ('d2111c09-6065-538e-82ac-ebc808461d3a', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'ser o motivo do próximo drama do grupo', 'caos', true, false, NULL, NULL),
  ('8e370fe1-e877-59a3-8abe-d063db372130', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'fazer o discurso mais embaraçoso da festa', 'leve', true, false, NULL, 'aniversario'),
  ('605fef92-9084-5fb6-84a7-675aae1396bf', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'acabar de fato de banho na despedida', 'picante', true, false, NULL, 'despedida'),
  ('45c165b1-cf0e-5a22-80ea-d2f9e7f57515', '2ae99c3f-dd93-5855-8289-65bdf7f5778f', 'ser o primeiro a chorar no reencontro', 'leve', true, false, NULL, 'reencontro')
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Termómetro (25)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('17e92320-7fc6-5c08-8765-ebf68b3c3258', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão bêbado/a estás agora? (0 = sóbrio, 10 = não sabes o teu nome)', 'leve', true, false, NULL, NULL),
  ('105f3bbc-25b1-5dda-8e01-1416ca72e8b4', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão bom/boa és a cantar? (0 = terrível, 10 = profissional)', 'leve', true, false, NULL, NULL),
  ('d99754b0-f186-51fb-873e-915b8944f8f1', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão bem dormiste esta semana?', 'leve', true, false, NULL, NULL),
  ('35b9e907-2e00-5c46-8b49-dee7245079d7', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão organizada está a tua casa neste momento?', 'leve', true, false, NULL, NULL),
  ('aafb1e62-557b-51a9-8b96-defa3315e629', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão competitivo/a és a jogar?', 'leve', true, false, NULL, NULL),
  ('feb123e6-fa5e-5a43-807d-89ab52e8100a', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão bem cozinhas?', 'leve', true, false, NULL, NULL),
  ('03ca1280-4a06-5583-898c-636fce1b1ca2', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão pontual és de verdade?', 'leve', true, false, NULL, NULL),
  ('71bc7d56-cf30-53c2-8b7c-1a6db6311192', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão feliz estás com a tua vida hoje?', 'leve', true, false, NULL, NULL),
  ('052c990d-f63c-580b-851b-c3fe2f2a7919', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão bem aguentas as bebidas?', 'picante', true, false, NULL, NULL),
  ('b0de33c1-e065-5c28-83d0-857eaed4d6e6', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão ciumento/a és numa relação?', 'picante', true, false, NULL, NULL),
  ('976a2fc6-fdd0-566c-83b5-60d66cfa8375', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão bem beijas (segundo os outros)?', 'picante', true, false, NULL, NULL),
  ('1824c321-5040-57fe-805a-876862e843ec', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão arriscado/a és numa noite de festa?', 'picante', true, false, NULL, NULL),
  ('7a975bd0-d2fb-512e-82e1-2caa62c9cc41', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão dependente és do telemóvel?', 'picante', true, false, NULL, NULL),
  ('e5761004-6285-5310-85f9-6dfe7480f739', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão perto estás de mandar mensagem a quem não devias?', 'picante', true, false, NULL, NULL),
  ('22879c1c-7441-56fa-813a-31c2ebb99273', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão longe já foste por alguém de quem gostavas?', 'hardcore', true, false, NULL, NULL),
  ('5b109ee3-b801-50b4-8235-1682cd57f65f', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão escandaloso seria o teu histórico de pesquisa?', 'hardcore', true, false, NULL, NULL),
  ('f8c4f4a0-a213-5497-883d-eaf2f6720639', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão disponível estás para uma loucura hoje?', 'hardcore', true, false, NULL, NULL),
  ('31d92db1-817b-588d-8dd9-422f3a9bedc8', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão bem esconderias uma traição?', 'hardcore', true, false, NULL, NULL),
  ('642831a0-2f11-5fb5-8ab2-33e94f17a92e', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão honesto/a és com este grupo?', 'caos', true, false, NULL, NULL),
  ('830ee35c-c975-5780-87a4-df9641e833ae', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão fácil seria cortares com alguém desta mesa?', 'caos', true, false, NULL, NULL),
  ('f1156878-76cd-5254-80fd-d2db48ab8bc6', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão bem julgas as pessoas em segredo?', 'caos', true, false, NULL, NULL),
  ('4feca26e-9306-5239-854d-ae5c883957f6', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão fiável és quando alguém precisa mesmo de ti?', 'caos', true, false, NULL, NULL),
  ('af8cf13b-88d9-585c-810f-486962af220c', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão memorável tem sido esta festa até agora?', 'leve', true, false, NULL, 'aniversario'),
  ('50923210-fe93-52d9-854e-2d8ac272ad2a', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão descontrolada vai acabar esta despedida?', 'picante', true, false, NULL, 'despedida'),
  ('59bb7f78-0428-5488-8d01-9f2f33998db3', '15a6c9e2-8ef7-51b9-8937-2997667586bb', 'Quão diferente estás desde a última vez que se viram?', 'leve', true, false, NULL, 'reencontro')
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Desenha (30)
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
  ('84ef50e1-b271-59b8-84b2-1fcdc987f43c', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Ressaca', 'leve', true, false, NULL, NULL),
  ('e26a8ed2-9040-598a-82c2-eee0cc52c094', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Pastel de nata', 'leve', true, false, NULL, NULL),
  ('9c32feb5-252a-5f14-8c9e-46436e880d90', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Elétrico de Lisboa', 'leve', true, false, NULL, NULL),
  ('80cd2b7f-a441-550c-86f9-f30834cd4b8d', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Selfie de grupo', 'leve', true, false, NULL, NULL),
  ('f8651a42-30de-5321-8f87-3b9bf063e880', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Festa de aniversário', 'leve', true, false, NULL, NULL),
  ('2554d6ec-2fdf-5afc-8382-9d3f95bb7a8c', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Cão a fugir', 'leve', true, false, NULL, NULL),
  ('e3147060-cd66-5a0e-8e62-55c8db052400', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Sardinha assada', 'leve', true, false, NULL, NULL),
  ('7a1d51ce-3e43-5fef-8e73-436a0ce1fbac', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Guarda-chuva partido', 'leve', true, false, NULL, NULL),
  ('2dc8ebff-36e1-5b61-8530-58cc36abf935', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Karaoke', 'leve', true, false, NULL, NULL),
  ('f54ebd4e-1bc9-5c1c-8132-b9a482a84852', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Praia cheia', 'leve', true, false, NULL, NULL),
  ('a5a12d42-84f4-5aac-8ba3-8ba96b5f14b0', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Fila do supermercado', 'leve', true, false, NULL, NULL),
  ('f451ac7b-a329-5246-878e-05513a23af35', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Bicicleta sem roda', 'leve', true, false, NULL, NULL),
  ('a22f0559-0248-59dd-80c7-7a4e3d2fc835', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Cair da cadeira', 'leve', true, false, NULL, NULL),
  ('cd1fbb08-63a6-57bb-8d3c-d4154d294b45', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Ganhar a lotaria', 'leve', true, false, NULL, NULL),
  ('342d0071-dff4-5a55-83dd-6a570726558d', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Casamento à pressa', 'picante', true, false, NULL, NULL),
  ('80b2ebd6-6a88-553e-8e7e-b5371e52fccd', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Primeiro encontro desastroso', 'picante', true, false, NULL, NULL),
  ('6dd42ceb-3fa0-5956-84c7-8a522e03c167', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Beijo interrompido', 'picante', true, false, NULL, NULL),
  ('8b7ce184-976f-5104-8d80-f48809f3a185', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Fugir pela janela', 'picante', true, false, NULL, NULL),
  ('d729b26d-5e1b-542c-8ffb-d7f1b1a5e93e', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Mensagem às 3 da manhã', 'picante', true, false, NULL, NULL),
  ('8cf039db-3cf4-5436-8596-4210f464aaa3', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Dança sensual', 'picante', true, false, NULL, NULL),
  ('939daf4a-ac4b-55a0-83fe-336fb738033b', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Apanhado pelos sogros', 'picante', true, false, NULL, NULL),
  ('054a1265-0831-555e-8295-5a82db578ff6', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Ex a aparecer na festa', 'picante', true, false, NULL, NULL),
  ('800c0459-7861-5e6a-87a0-730a9b15c4c4', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Regresso a casa de manhã', 'hardcore', true, false, NULL, NULL),
  ('5e6e5744-eab7-5109-8b9a-dab28c6502de', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Roupa espalhada pelo chão', 'hardcore', true, false, NULL, NULL),
  ('42ec41a3-c54b-5d18-82af-f4d85b84c35d', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Chamada perdida do patrão', 'hardcore', true, false, NULL, NULL),
  ('30b17e90-6a11-55ac-8c24-bd2d30d25e2c', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Discussão de casal na rua', 'hardcore', true, false, NULL, NULL),
  ('d54991fd-fb14-5ca5-82ff-68912293dedb', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Traição descoberta', 'caos', true, false, NULL, NULL),
  ('fef9d6d0-8c87-5862-864f-616d2b11653b', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Grupo de WhatsApp em chamas', 'caos', true, false, NULL, NULL),
  ('0eedbf02-eb16-5210-838f-e21103128319', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Bloquear alguém nas redes', 'caos', true, false, NULL, NULL),
  ('17ec96d9-6493-574f-82b8-22f79974f5c9', '1534967b-23af-55ec-8f81-b16cbfc4c026', 'Amizade desfeita', 'caos', true, false, NULL, NULL)
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;

-- Quem Disse: sem prompts (mecânica pura — o conteúdo é gerado pelo motor).

-- Cascata: sem prompts (mecânica pura — o conteúdo é gerado pelo motor).

-- Reação: sem prompts (mecânica pura — o conteúdo é gerado pelo motor).

COMMIT;

-- Conferência rápida (deve dar 18 e 360):
--   SELECT count(*) FROM game_types;
--   SELECT count(*) FROM prompts;
