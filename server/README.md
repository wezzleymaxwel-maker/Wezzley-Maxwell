# CAATINGA — servidor online

Servidor autoritativo em Node.js: salas privadas por código, de dois a seis participantes, bots nas vagas vazias, turnos validados no servidor, dados aleatórios criptográficos, mãos privadas, propostas de troca com aceite, prevenção de jogadas duplicadas e reconexão à mesma vaga.

## Hospedar no seu computador (Windows)

1. Baixe https://wezzleymaxwel-maker.github.io/Wezzley-Maxwell/CAATINGA-Servidor-Windows.zip e extraia a pasta inteira.
2. Abra **INICIAR-ONLINE.cmd**. O primeiro uso baixa os componentes oficiais e verifica seus hashes.
3. O iniciador sobe o servidor em uma porta local livre, abre um túnel HTTPS temporário e verifica a conexão antes de abrir o jogo.
4. No jogo, digite seu nome, crie a sala e use **Copiar convite**. Seus amigos entram pelo link em suas próprias casas.
5. Mantenha o computador e a janela ligados durante a partida. Pressione ENTER para encerrar.

A conexão funciona também com CGNAT e usa o Cloudflare Quick Tunnel. O endereço muda quando o iniciador é reiniciado: envie um novo convite em uma nova sessão. Os arquivos de apoio e as partidas ficam em `%LOCALAPPDATA%\CAATINGA\Servidor`.

O jogo escuta somente em 127.0.0.1 neste modo. O iniciador utiliza um token privado e temporário para pedir o salvamento antes de encerrar o servidor. A porta escolhida, os componentes portáteis e o túnel são gerenciados pelo iniciador.

Para gerar o pacote a partir do código, use `npm run package:pc-host`. `npm run test:pc-host` valida o ZIP, a execução sem dependências instaladas e o encerramento com salvamento.

## Hospedar no Render

1. Entre em https://render.com com sua conta do GitHub.
2. Crie um **Web Service**, conecte `wezzleymaxwel-maker/Wezzley-Maxwell` e escolha a branch **online-server**.
3. Runtime: **Node**. Build Command: `npm ci --include=dev && npm run online:build`. Start Command: `npm run online:server`. Health Check: `/health`.
4. Escolha o plano Free para começar. O serviço fornece uma URL HTTPS após o deploy. A primeira conexão depois de o serviço ficar inativo pode demorar enquanto ele inicia.
5. No jogo, entre em **Multijogador → Conexão do servidor**, cole essa URL e crie uma sala. O convite copiado já leva o endereço e o código da sala; nunca contém o token da pessoa que convidou.

O arquivo `render.yaml` também contém uma configuração Blueprint equivalente. Não precisa de chave secreta do GitHub no jogo nem de banco de dados para começar.

Para deixar a URL do servidor predefinida para todos, compile o jogo com `VITE_CAATINGA_SERVER=https://seu-servico.onrender.com` e publique a nova versão do site.

## Rodar localmente

```sh
npm ci --include=dev
npm run online:build
npm run online:server
```

O servidor abre a porta `8787`, ou a porta definida em `PORT`. No jogo em desenvolvimento, use `http://127.0.0.1:8787`. Em produção, use HTTPS.

## Variáveis

- `PORT`: porta HTTP, preenchida automaticamente pelo Render.
- `CAATINGA_ORIGINS`: origens do site autorizadas, separadas por vírgula. O padrão permite o GitHub Pages deste projeto e desenvolvimento local na porta 5174.
- `CAATINGA_DATA_DIR`: pasta de salvamento das salas. O padrão é `.online-data`. Em hospedagens com disco persistente, a pasta deve apontar para o volume montado.

As salas expiram após 24 horas sem jogadas. O navegador guarda a sessão na aba para reconectar após atualizar a página. Um participante desconectado mantém sua vaga. Após 90 segundos sem conexão, o computador joga temporariamente por ele; ao reconectar com a mesma sessão, o participante retoma suas cartas e construções. Depois de reiniciar o servidor há uma nova tolerância de 90 segundos para reconectar.

No plano gratuito do Render, o armazenamento local é temporário. Reiniciar ou republicar o serviço pode apagar as salas. Para preservar partidas entre reinícios, configure um disco persistente em um plano compatível ou um armazenamento externo. Não trate o plano gratuito como salvamento permanente.

## Validação

```sh
npm run test:online
npm run online:build
```

`npm run test:sertao:online` também testa três navegadores independentes com Vite em `5174` e servidor em `8787`.

## Protocolo

`GET /health` informa disponibilidade, versão e protocolo. As solicitações de jogo devem enviar `protocol: 2`; o cliente verifica a compatibilidade antes de criar ou retomar uma sala. `POST /api` aceita create, join, resume, poll, start, action e leave. Cada sessão recebe um token aleatório próprio; o token não aparece nos convites nem nas visões dos outros jogadores. Ações enviam comando, versão esperada e identificador único, nunca o estado completo. Apenas o servidor calcula resultados. O baralho usa embaralhamento criptográfico independente da semente pública do tabuleiro.

## Configuração da mesa

A criação da sala aceita `options: {players: 2..6, mapSize: "classic" | "double"}`. O mapa duplo tem 38 terrenos e 38 cartas de cada recurso no banco. Partidas existentes continuam com suas opções originais. Atualize o iniciador de Windows para hospedar as mesas ampliadas.


### Atualizações e retomada

A versão instalada aparece em Opções e no iniciador. `release.json` identifica a versão publicada e sua compilação; o jogo e o iniciador avisam quando existem arquivos novos. Servidores com protocolo antigo não aceitam o jogo atual: atualize o ZIP e os navegadores. As partidas permanecem em `%LOCALAPPDATA%\CAATINGA\Servidor`, fora da pasta extraída.

Ao reiniciar o túnel, mantenha a aba antiga aberta. Abra a sala, informe o endereço novo e escolha Reconectar à minha sala. O código e o token permanecem na aba, preservando a vaga. Fechar a aba pode perder essa sessão; os tokens não são incluídos no convite. O computador anfitrião e a janela do servidor precisam continuar ligados durante a partida.

Maior estrada vale dois pontos a partir de cinco trechos contínuos. Empates preservam o dono atual; bifurcações não se somam e construções adversárias interrompem o caminho. O dono é salvo e remapeado nas visões privadas de cada participante.
