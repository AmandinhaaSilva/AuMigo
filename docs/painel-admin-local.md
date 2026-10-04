# Painel administrativo local

T08 mantém a guarda de administrador ativo da T07 e inicia consultas do painel somente depois dessa autorização. O painel mostra contagens de `animals`, `products`, `adoptionRequests` e `donations` e permite criar ou substituir integralmente `siteSettings/public`.

Com Auth e Firestore Emulator ativos nos endpoints oficiais:

```powershell
npm run fixtures:auth
npm run verify:panel
```

O verificador cobre estado vazio, métricas reais, configuração ausente, criação, edição, validação sem escrita, não administrador, revogação/erro, estrutura acessível e confirmação da limpeza. Ele cria quatro documentos e um administrador temporários, altera `siteSettings/public` durante os cenários e restaura tudo no `finally`, inclusive o estado inexistente original.

O formulário remove a formatação do telefone antes de validar 10–15 dígitos e grava exatamente `schemaVersion`, `brandName`, `whatsappDigits`, `whatsappGreeting`, `updatedAt` e `updatedBy`. CRUD de catálogo e tratamento de solicitações permanecem fora de T08.
