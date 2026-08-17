-- =====================================================================
-- F&D — Seed de conteúdo (game_types + prompts)
-- =====================================================================
-- Idempotente: ON CONFLICT atualiza em vez de duplicar. Correr DEPOIS de
-- 01_schema.sql. Espelha server/prisma/seed.js / src/content/prompts.data.js.
-- =====================================================================

BEGIN;

-- ---------- Tipos de jogo (UUIDs fixos p/ referência estável) ----------
INSERT INTO game_types (id, key, label, active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'boca_calada', 'Boca Calada', true),
  ('22222222-2222-2222-2222-222222222222', 'desafio', 'Desafio', true),
  ('33333333-3333-3333-3333-333333333333', 'intrigas', 'Intrigas', true),
  ('44444444-4444-4444-4444-444444444444', 'segredos', 'Segredos Anónimos', true)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, active = true;

-- ---------- Prompts ----------
-- Boca Calada (22)
INSERT INTO prompts (id, game_type_id, text, intensity, active) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Fica sério durante 60s enquanto o grupo tenta fazer-te rir.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Não podes falar até ser a tua próxima vez. Falas = perdes vida.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Aguenta 30s a olhar nos olhos do jogador à tua direita sem rir.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Só podes responder por gestos até ao fim da ronda.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Mantém a cara séria enquanto o grupo conta a piada mais má que souber.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Fica calado e imita a expressão de quem estiver a falar contigo.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Aguenta sem sorrir enquanto todos dizem o teu nome em tom ridículo.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Não podes dizer "sim" nem "não" durante duas rondas.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Fica sério enquanto o grupo faz sons de animais à tua volta.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Mantém a boca fechada durante 45s enquanto te fazem cócegas com o olhar.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Aguenta sem rir enquanto alguém te elogia exageradamente.', 'leve', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Fica sério enquanto o grupo reencena o teu momento mais embaraçoso.', 'picante', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Não podes rir enquanto contam a história mais constrangedora sobre ti.', 'picante', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Aguenta sério enquanto o teu crush do grupo (se houver) te faz olhinhos.', 'picante', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Fica calado enquanto o grupo vota se és bom ou mau a beijar.', 'picante', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Mantém a pose enquanto alguém imita como ficas depois de uns copos.', 'picante', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Não podes reagir enquanto leem em voz alta a tua última mensagem enviada.', 'picante', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Fica sério enquanto o grupo descreve o teu tipo ideal.', 'picante', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Aguenta sem rir enquanto fazem uma imitação tua a paquerar.', 'picante', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Não podes falar enquanto respondes por gestos "o que farias numa primeira noite".', 'picante', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Mantém a cara séria enquanto o grupo adivinha o teu segredo mais picante.', 'picante', true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Fica calado enquanto dois jogadores discutem quem gosta mais de ti.', 'picante', true)
ON CONFLICT (game_type_id, text) DO UPDATE SET intensity = EXCLUDED.intensity, active = true;

-- Desafio (22)
INSERT INTO prompts (id, game_type_id, text, intensity, active) VALUES
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Faz a tua melhor imitação de outro jogador; se ninguém adivinhar, bebes.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Fala com sotaque estrangeiro até à tua próxima vez.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Liga a um contacto aleatório e canta-lhe os parabéns.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Dança 20 segundos sem música.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Deixa o jogador à tua esquerda publicar um emoji no teu status.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Faz 10 flexões ou bebes dois copos.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Fala só a rimar durante a próxima ronda.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Imita um animal até alguém adivinhar qual é.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Deixa o grupo escolher-te uma nova alcunha para o resto do jogo.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Conta uma anedota; se ninguém rir, bebes.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Faz uma pose de ginásio e mantém-na 30s.', 'leve', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Envia "estava só a pensar em ti 😊" à terceira conversa do teu WhatsApp.', 'picante', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Mostra a última foto da tua galeria (sem escolher).', 'picante', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Deixa o grupo ler a tua última mensagem enviada em voz alta.', 'picante', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Descreve o teu pior encontro em três frases.', 'picante', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Deixa o jogador à tua direita escrever um story teu por 15s.', 'picante', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Troca uma peça de roupa com o jogador ao teu lado.', 'picante', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Faz uma serenata improvisada a quem o grupo escolher.', 'picante', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Confessa qual foi a maior mentira que disseste neste grupo.', 'picante', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Deixa o grupo ver quantas conversas tens fixadas — sem abrir.', 'picante', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Recria o teu melhor movimento de dança "de fim de noite".', 'picante', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Manda uma nota de voz a cantar para o último contacto com quem falaste.', 'picante', true)
ON CONFLICT (game_type_id, text) DO UPDATE SET intensity = EXCLUDED.intensity, active = true;

-- Intrigas (22)
INSERT INTO prompts (id, game_type_id, text, intensity, active) VALUES
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem é mais capaz de adormecer numa festa? O grupo vota.', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem chega sempre atrasado? Votem.', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem tem o pior gosto musical? Votação.', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem é mais provável de perder o telemóvel esta noite?', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem fala mais alto quando bebe?', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem seria o pior a guardar um segredo?', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem gasta mais tempo ao espelho?', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem é mais capaz de comer o que sobra no prato dos outros?', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem seria o primeiro a fugir num filme de terror?', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem tem sempre a desculpa mais criativa para faltar?', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem é o mais dramático do grupo?', 'leve', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem é mais provável de mandar mensagem ao ex a meio da noite?', 'picante', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem já teve a maior queda por alguém deste grupo?', 'picante', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem é mais capaz de beijar um desconhecido numa saída?', 'picante', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem tem mais probabilidade de ter um crush secreto agora mesmo?', 'picante', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem seria o mais atrevido num jogo de verdade ou consequência?', 'picante', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem já flirtou para não pagar a conta?', 'picante', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem é mais provável de se apaixonar em férias?', 'picante', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem tem o histórico de encontros mais caótico?', 'picante', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem seria o primeiro a dizer "eu amo-te" cedo demais?', 'picante', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem é mais capaz de dar o número falso a alguém?', 'picante', true),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Quem tem a maior probabilidade de acabar a noite a dançar em cima da mesa?', 'picante', true)
ON CONFLICT (game_type_id, text) DO UPDATE SET intensity = EXCLUDED.intensity, active = true;

-- Segredos Anónimos (22)
INSERT INTO prompts (id, game_type_id, text, intensity, active) VALUES
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Submete um segredo sobre a tua infância. O grupo adivinha de quem é.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Confessa anonimamente um medo estranho que tenhas.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Partilha a coisa mais infantil que ainda fazes.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Escreve um talento escondido que ninguém aqui conhece.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Confessa um hábito esquisito que tens quando estás sozinho/a.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Partilha a compra mais inútil que já fizeste.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Escreve algo por que já choraste a ver um filme.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Confessa uma mentira inofensiva que dizes com frequência.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Partilha o prato que finges gostar mas odeias.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Escreve a coisa mais embaraçosa que tens no histórico de pesquisa.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Confessa uma manha que usas para faltar a compromissos.', 'leve', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Partilha um segredo sobre a tua vida amorosa. O grupo adivinha de quem é.', 'picante', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Confessa anonimamente o teu maior arrependimento romântico.', 'picante', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Escreve o sítio mais inusitado onde já deste um beijo.', 'picante', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Partilha algo que nunca contaste a ninguém deste grupo.', 'picante', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Confessa se já tiveste um crush em alguém presente (sem dizer quem).', 'picante', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Escreve a mensagem mais atrevida que já enviaste.', 'picante', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Partilha o encontro mais louco que já tiveste.', 'picante', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Confessa uma paixoneta secreta por alguém famoso improvável.', 'picante', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Escreve algo de que te arrependes de ter feito numa festa.', 'picante', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Partilha a desculpa mais dramática que já deste para acabar um encontro.', 'picante', true),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'Confessa o segredo que levarias para o túmulo... até agora.', 'picante', true)
ON CONFLICT (game_type_id, text) DO UPDATE SET intensity = EXCLUDED.intensity, active = true;

COMMIT;
