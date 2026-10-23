# ÚLTIMA ZONA

Versão 0.3 de um battle royale FPS single-player para navegador desktop, com cenário texturizado, personagens articulados e resolução adaptativa. Zezé enfrenta 24 operadores em um vale procedural de 700 × 700 m. TypeScript, Three.js e Vite; sem servidor de jogo, contas, multiplayer ou assets pagos.

## Baixar e jogar, sem instalação

**[Baixar o jogo pronto (.zip)](https://github.com/wezzleymaxwel-maker/Wezzley-Maxwell/raw/refs/heads/main/downloads/Ultima-Zona-v0.3.0.zip)**

O pacote pronto também está na pasta [`downloads/`](downloads/). Para jogar, não é necessário compilar o projeto.

A entrega pronta fica em **`release/Ultima-Zona.zip`** (gerada por `npm run package`).

1. Baixe o ZIP e extraia seu conteúdo para uma pasta.
2. Abra **`Ultima-Zona/JOGAR.html`** no Chrome, Edge ou Firefox atualizado.
3. Clique em **Jogar agora** e permita a captura do mouse.

O HTML já contém todo o jogo, incluindo Three.js, estilos e recursos procedurais. **Não precisa instalar Node.js, executar comandos ou ter internet para jogar.** Use computador desktop com teclado, mouse e WebGL2/aceleração de hardware. Em computador modesto, escolha **Baixo** nas configurações. Esc pausa e libera o mouse; use **Continuar** para retomar. Não abra o HTML na prévia do ZIP: extraia antes.

O ZIP também inclui instruções rápidas, licenças e o código-fonte. Fechar a aba encerra o jogo; não há instalação de serviços.

## Desenvolver e gerar nova entrega

Somente para trabalhar no código: Node.js 22.12+ (validado com Node 24) e npm.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run package
```

`npm run package` compila e gera o HTML autossuficiente, ZIP e `release/SHA256SUMS.txt`. O empacotamento preserva as licenças dos componentes usados e exclui `.git`, caches e dependências de desenvolvimento.

O `dist/index.html` comum é destinado a um servidor HTTP (`npm run preview`); para abrir por duplo clique, use **`release/JOGAR.html`**.

## Visual e desempenho na versão 0.3

- Armas reconstruídas com canos, miras, gatilhos, carregadores e superfícies de metal/madeira; mãos com dedos, luvas e mangas.
- Operadores com rosto, capacete, colete, mochila, joelhos e movimento articulado. À distância, um modelo de 652–884 triângulos substitui a versão detalhada de cerca de 9 mil triângulos.
- Paredes com relevo e desgaste, telhados inclinados, janelas com molduras/aberturas, árvores com galhos/folhas, pedras irregulares, veículos e objetos mais reconhecíveis. Os materiais usam mapas originais de cor, relevo e rugosidade.
- Céu gradual, nuvens, horizonte, reflexos ambientais e gás com camadas de névoa. Sombras são estabilizadas em incrementos do mapa para reduzir cintilação.
- Interpolação da câmera/personagens entre passos físicos, movimentos do mouse aplicados a cada quadro e resolução que se adapta à carga sustentada. Qualidade Baixo reduz vegetação decorativa, distância e sombras.
- Agrupamento espacial do cenário, menos geometria à distância, minimapa com fundo em cache, atualizações de HUD somente quando mudam e limite de recálculo de rotas por quadro.
- As consultas físicas usam um índice espacial; a precisão dos tiros e a visibilidade continuam respeitando as mesmas superfícies e regras.

Benchmark de CPU reproduzível: `npx tsx tests/benchmark-queries.ts`. Neste ambiente Linux, 1.000 consultas sobre 500 raios levaram mediana de **2.731,01 ms** no percurso direto e **12,64 ms** com o índice, em três rodadas. Todos os impactos e as 140 linhas de visão bloqueadas coincidiram. Essa medida isola consultas de colisão/visão; **não é um ganho de FPS da aplicação inteira nem uma medição em GPU integrada**. Execute o script no seu computador para comparar.

Todos os modelos e mapas de superfície são gerados localmente pelo código. A direção visual usa materiais e formas mais detalhados, mas a entrega ainda não tem captura facial, fotogrametria ou animações de um estúdio especializado.

## Controles

| Entrada                   | Ação                                |
| ------------------------- | ----------------------------------- |
| WASD / mouse              | Mover / olhar                       |
| Clique esquerdo / direito | Atirar / mirar                      |
| Shift / Ctrl / Espaço     | Correr / agachar / pular            |
| E / R / F                 | Coletar / recarregar / consumir kit |
| 1–5                       | Equipar arma já coletada            |
| Tab / M / Esc             | Inventário / mapa / pausa           |

Há cinco armas próximas ao ponto inicial para experimentar; outros pontos de saque ficam em mesas, depósitos, contêineres e plataformas. Use E a menos de 3 m, com linha de visão ao item. A arma coletada é equipada automaticamente. O inventário permite descartar armas. Cada arma mantém carregador e reserva próprios. Kits levam três segundos e curam 60 pontos; colete absorve parte do dano balístico e não protege do gás.

## Sistemas implementados

- Movimentação FPS com colisão deslizante, aceleração, corrida, agachamento, salto, mira e câmera com oscilação.
- Pistola, espingarda de oito projéteis por disparo, metralhadora automática, compacta semiautomática e sniper com ampliação. Carregadores 15/6/60/20/5; munição finita, recarga, dispersão, recuo, impactos, traçantes e multiplicador de cabeça.
- 24 bots: oito fáceis, dez médios e seis difíceis, com seis perfis. Campo de visão, raycasting de oclusão, audição aproximada, memória temporária, reação, investigação, saque, ataque, cobertura simples, recuo, cura e fuga do gás. A navegação combina linha direta com verificação do volume do personagem, A* em grade com orçamento de trabalho e recuperação de bloqueios. Bots consomem munição e eliminam uns aos outros.
- Vila residencial, centro, indústria, posto, base militar, árvores instanciadas, pedras, relevo, estradas, interiores e plataformas acessíveis por escadas. As entradas são abertas; paredes bloqueiam movimento, tiros e visão.
- Zona com seis fases de 70 s de espera + 60 s de fechamento: 13 minutos até o fechamento total. Círculos contidos, centros variáveis, dano progressivo igual para todos e parede visual de gás. Uma partida pode acabar antes disso por combate.
- Loot físico, cura, colete, suprimentos, inventário, descarte e drops de eliminados.
- HUD, minimapa e mapa sem revelar adversários, bússola, histórico de eliminações, pausa, resultado com posição, dano, tempo e eliminações, reinício e configurações de sensibilidade/volume/qualidade.
- Personagens geométricos, animação de pernas, modelo de arma e braço em primeira pessoa, prévia do personagem e cores básicas; áudio sintetizado com atenuação de distância e panorama estéreo.
- Cenário estático agrupado por material, vegetação instanciada, percepção em intervalos, partículas temporárias limitadas pelo tempo de vida e opções de resolução/sombras/distância.

## Estrutura

| Módulo               | Responsabilidade                                                 |
| -------------------- | ---------------------------------------------------------------- |
| `src/main.ts`        | Integração, partida, entrada, atores, decisões de IA e interface |
| `src/world.ts`       | Mapa, construções, terreno e colisão                             |
| `src/navigation.ts`  | Rotas A* e grade de obstáculos                                   |
| `src/combat.ts`      | Visibilidade e primeiro impacto balístico                        |
| `src/rules.ts`       | Armas, gás, dano e transferência de munição                      |
| `src/models.ts`      | Armas, mãos e operadores com articulação e LOD                   |
| `src/materials.ts`   | Mapas originais de cor, relevo e rugosidade                      |
| `src/atmosphere.ts`  | Céu, horizonte e luz ambiental                                   |
| `src/performance.ts` | Controle adaptativo da resolução                                 |
| `src/spatial.ts`     | Índice espacial para as consultas físicas                        |
| `src/rendering.ts`   | Agrupamento do cenário estático                                  |
| `src/settings.ts`    | Validação e armazenamento opcional de preferências               |
| `src/lifecycle.ts`   | Temporizadores e passo fixo da simulação                         |
| `src/audio.ts`       | Síntese sonora                                                   |
| `src/*.test.ts`      | Testes unitários de regras, combate e colisões                   |
| `tests/browser.mjs`  | Fluxo real em Chromium e simulação de partida                    |

Os parâmetros de armas e zona ficam em `rules.ts`. As regiões e pontos de saque são gerados em `world.ts`. Toda geometria e todo áudio são produzidos pelo código deste projeto.

## Validação e correções de estabilidade

Com `npm run dev -- --port 5173` ativo:

```sh
npm run test:browser
npm run test:stability
```

Após `npm run package`:

```sh
npm run test:package
node --test scripts/package.test.mjs
```

Os scripts usam `/usr/bin/chromium`; defina `CHROMIUM_PATH` para outra instalação. A suíte de estabilidade verifica disparos **depois** de recarga e cura, armazenamento bloqueado, liberação de teclas ao pausar, oito reinícios com contagem de recursos gráficos, vitória em um duelo final preparado, conservação de munição ao descartar/recolher armas e dano no centro do gás final. O teste de partida natural mantém bots, combate e dano reais, sem invulnerabilidade.

O parâmetro **somente de desenvolvimento** `?test` expõe avanço de tempo e cenários controlados de regressão. Essas ações não existem no build de produção; não são recursos para o jogador.

Correções desta revisão:

- Recarga e cura não deixam temporizadores negativos bloqueando o combate.
- Descartar e recolher uma arma conserva a munição; o ciclo não cria balas extras.
- Geometrias, materiais e prévias são liberados na troca/coleta/reinício; efeitos e vozes de áudio têm limites.
- Preferências ausentes, inválidas ou sem permissão de armazenamento não interrompem a partida.
- Falhas de captura do mouse têm recuperação visível; pausa limpa entradas, mudança de aba pausa e perda do contexto gráfico interrompe a simulação com orientação de recuperação.
- Atualizações param imediatamente ao encerrar a partida. O gás final atinge até o ponto central para evitar sobreviventes imunes.
- Caminhos verificam paredes entre células e respeitam intervalos de recálculo; salto e queda colidem com tetos e plataformas.
- Spawns evitam o gás, a sobreposição entre bots e a proximidade imediata do jogador no início.

O teste portátil abre o **mesmo HTML embutido** por HTTP local e desativa a rede antes de jogar, sem requisições externas. A abertura direta por `file://` é bloqueada pela política administrativa do Chromium deste ambiente; para repeti-la num navegador local sem essa política, use `node scripts/verify-package.mjs --file`. Nenhuma política de segurança foi desativada. Windows/macOS reais e GPUs integradas não foram testados neste ambiente Linux; não há promessa de ausência de bugs ou 60 FPS em qualquer equipamento.

## Limitações desta versão

Esta entrega é uma base jogável integrada, ainda abaixo do acabamento e de toda a variedade descritos no briefing:

- Modelos e superfícies são procedurais; o áudio é sintetizado. Há articulação de membros e detalhes de mãos, mas não há captura de movimentos, expressões faciais animadas ou animações completas de dedos durante a recarga. A personalização é básica.
- Construções têm entradas abertas, interiores simples e plataformas; não há portas interativas, vários cômodos completos ou segundos andares internos mobiliados.
- Cobertura e flanqueamento são heurísticos. A grade de 3 m pode falhar em passagens estreitas, e a recuperação redireciona o bot. Perfis ainda afetam poucas decisões. Não há navmesh nem ajuste de dificuldade por telemetria.
- Os bots começam armados. O saque usa pontos fixos e tipos aleatórios a cada partida, com drops adicionais; ainda não há tabelas de raridade por região. Mochila é um pacote de suprimentos, não um sistema de capacidade. Não há acessórios ou bandagens separadas.
- O inventário oferece cinco espaços de armas e descarte, sem peso, arraste ou limite de mochila.
- Não há garantia de 60 FPS nem validação em GPU integrada real. O LOD e a resolução adaptativa reduzem custos; efeitos atmosféricos são simples e o áudio ainda não é HRTF. A simulação usa passos fixos com limite de recuperação por quadro; computadores muito lentos podem apresentar câmera lenta.
- Derrota, reinício e a transição de vitória após um duelo final controlado são automatizados. Isso não equivale a uma vitória jogada manualmente durante 13 minutos. As seis fases são cobertas por testes determinísticos.
- Não há multiplayer, persistência de partidas ou suporte mobile. O pacote portátil é entregue; o desempenho em outro computador depende do navegador e do hardware.

Não são necessárias chaves, serviços externos, banco de dados ou credenciais para jogar.
