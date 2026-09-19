# Rock Radar — Scriptable

Agregador pessoal para stoner rock, doom, heavy psych, desert rock, sludge e cenas próximas.

## Estrutura
- `RockRadar.js` — coleta, classifica, pontua e exibe posts.
- `sources.json` — fontes gerenciáveis.
- `categories.json` — categorias, palavras-chave e tags.
- `watched-artists.json` — bandas prioritárias.
- `RockRadar Widget.js` — widget opcional.
- `RockRadar Sync.js` — sincronização GitHub → Scriptable.

## Fontes
A configuração inicial inclui The Obelisk, Doom Charts, Angry Metal Guy, The Sleeping Shaman, Outlaws of the Sun, Riff Vault, Roadie Crew, Tenho Mais Discos Que Amigos!, Blabbermouth, KEXP, Audiotree, Rockpalast, Roadburn e Heavy Psych Sounds.

As fontes de Instagram ficam cadastradas, porém desativadas na v1 porque scraping público do Instagram é instável e frequentemente exige autenticação.

## Instalação
1. Copie `RockRadar Sync.js` para o Scriptable.
2. Se este repositório estiver público, execute o Sync.
3. Depois execute `RockRadar.js`.
4. Opcionalmente adicione `RockRadar Widget` como widget do Scriptable.

## Repositório privado
O endereço raw do GitHub não pode ser lido anonimamente quando o repositório é privado. Para o Sync simples funcionar, torne o repositório público. Uma alternativa futura é usar um token armazenado no Keychain do Scriptable.

## Gerenciamento
Para desativar uma fonte, altere `enabled` para `false` em `sources.json`. Para criar/remover categorias, edite `categories.json`.