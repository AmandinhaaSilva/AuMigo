# Adoções locais (T09)

O fluxo de adoções usa exclusivamente o projeto fictício `demo-aufriends-local` e os emuladores de Auth, Firestore e Storage em loopback. Não existe cadastro público, leitura pública de solicitações, integração com PHP/MySQL ou acesso a projeto remoto.

## Preparar dados de demonstração

Com a suíte local já ativa, aplique primeiro as contas T07 e depois os três animais fictícios de T09:

```powershell
npm run fixtures:auth
npm run fixtures:adoptions
```

A fixture de adoções é idempotente e sobrescreve somente `animals/t09-luna`, `animals/t09-thor` e `animals/t09-jade`, com imagens copiadas dos assets locais para caminhos fixos válidos em `public/animals/**`. Ela não cria solicitações nem lê o SQL legado. As credenciais locais descartáveis permanecem documentadas em `docs/autenticacao-admin-local.md`.

Rotas para conferência:

- catálogo público: `http://127.0.0.1:5000/adocoes`;
- detalhe: abra um card do catálogo para manter o ID correto na URL;
- login administrativo: `http://127.0.0.1:5000/admin`;
- painel protegido: `http://127.0.0.1:5000/admin/painel`.

## Verificação automatizada

```powershell
npm run verify:t09
```

O verificador usa o Web SDK contra os três emuladores oficiais e cobre normalização/antispam, persistência do ID da tentativa, cadastro e mídia, consulta/filtros/detalhe público, publicação, transições, submissão exata, negações públicas e de não administrador, tratamento administrativo, substituição de imagem e exclusão. Os documentos e objetos criados pelo verificador recebem IDs exclusivos e são removidos ao final; os três animais fixos permanecem para a conferência visual.

## Limites operacionais

- JPEG, PNG e WebP são aceitos até 5 MiB. Navegadores com `createImageBitmap` redimensionam o maior lado para até 1600 px e preferem WebP antes do upload.
- Na substituição, a imagem anterior só é apagada depois de o documento apontar para a nova. Se essa limpeza final falhar, o painel informa o caminho órfão para remoção manual.
- Honeypot, tempo mínimo e ID de tentativa em `sessionStorage` reduzem reenvio acidental e automação trivial; não são rate limit. App Check e revisão de abuso permanecem para T13.
- A validação visual desktop/celular continua sob responsabilidade do Orquestrador; este procedimento não inicia, reinicia nem encerra emuladores.
