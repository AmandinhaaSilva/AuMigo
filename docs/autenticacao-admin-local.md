# Autenticação administrativa local

Este procedimento é exclusivo da suíte `demo-aufriends-local`. Ele não cria cadastro público, não grava senhas no Firestore e aborta se Auth ou Firestore não estiverem nos hosts e portas loopback oficiais.

Com os emuladores já ativos, aplique a fixture idempotente:

```powershell
npm run fixtures:auth
```

Credenciais fictícias, descartáveis e proibidas em staging/produção:

| Papel local | E-mail | Senha |
| --- | --- | --- |
| Administrador ativo | `admin@aufriends.local` | `AuFriendsLocal!2026` |
| Usuário autenticado sem acesso | `usuario@aufriends.local` | `UsuarioLocal!2026` |

A fixture usa UIDs fixos, redefine essas duas contas no Auth Emulator, sobrescreve somente `admins/local-admin-aufriends` com `active: true` e garante que o usuário comum não tenha documento em `admins`. Rodá-la novamente não duplica contas nem documentos.

A verificação de linha de comando cobre credencial administrativa, senha inválida, não administrador, logout, recuperação, troca autenticada e restauração de senha, ocultação inicial/guard e ausência de cadastro público:

```powershell
npm run verify:auth
```

A persistência real após recarga continua sendo um cenário de navegador: entrar como administrador, recarregar `/admin/painel` e confirmar que o painel só aparece depois da validação do registro ativo.

O link de recuperação é gerado pelo Auth Emulator e pode ser consultado na interface local em `http://127.0.0.1:4000/auth`. O adaptador `firebase-local.js` aceita somente o projeto demo e origens/serviços em loopback; uma configuração ou origem remota falha antes de conectar qualquer emulador. Contas remotas continuam sendo provisionadas fora do Web SDK por um operador autorizado.
