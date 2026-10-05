# Administração em produção

O acesso administrativo usa Firebase Authentication com e-mail/senha e só recebe privilégios quando existe `admins/{uid}` com `active: true` no Firestore. Uma conta autenticada sem esse documento continua sem acesso ao painel e às escritas administrativas.

## Provisionar uma conta

O script privilegiado recebe e-mail e senha somente por variáveis do processo. Ele recusa outro projeto, não imprime a senha e não a grava em arquivo, Firestore ou Git.

```powershell
$env:AUFRIENDS_PRODUCTION_PROJECT_ID = "memberverse-sfhf9"
$env:AUFRIENDS_PRODUCTION_CONFIRM = "PROVISION_AUFRIENDS_ADMIN"
$env:AUFRIENDS_ADMIN_EMAIL = "administrador@example.com"
$env:AUFRIENDS_ADMIN_DISPLAY_NAME = "Administradora AuFriends"
$securePassword = Read-Host "Senha temporária" -AsSecureString
$temporaryPassword = [Net.NetworkCredential]::new("", $securePassword).Password
try {
  $temporaryPassword | npm run provision:production:admin
} finally {
  $temporaryPassword = $null
  $securePassword.Dispose()
}
```

Se o e-mail já existir com outra senha, o script interrompe sem substituir a credencial. Se uma conta acabou de ser criada e a autorização no Firestore falhar, ele tenta remover essa conta nova para não deixar um acesso incompleto.

## Convidar outro administrador pelo painel

Um administrador ativo pode abrir **Administradores**, informar nome e e-mail e confirmar a própria senha. O navegador cria a nova conta em uma instância Auth secundária, preserva a sessão atual, envia ao convidado o link para definir a senha e somente então grava `admins/{uid}` como ativo, com a origem do convite registrada em `createdBy` e `updatedBy`.

O formulário cria apenas endereços que ainda não possuem conta no Firebase Auth. Promover uma conta preexistente continua exigindo o procedimento privilegiado, pois o Web SDK não pode consultar UID por e-mail. Se a concessão no Firestore falhar, o fluxo tenta excluir a conta Auth recém-criada para não deixar um cadastro incompleto.

## Alterar ou recuperar a senha

- Com a sessão aberta: entrar em `/admin/painel`, abrir **Segurança**, informar a senha atual e cadastrar uma nova senha com pelo menos 12 caracteres. O Firebase exige reautenticação antes de aplicar a alteração.
- Sem acesso à senha atual: em `/admin`, informar o e-mail e usar **Esqueci minha senha**. O Firebase envia o fluxo de recuperação ao endereço cadastrado.

A senha temporária deve ser substituída no primeiro teste real. Nenhuma senha de produção deve aparecer em documentação, issues, commits, notas do Maestri ou capturas de tela.

## Desativar acesso

Desativar ou excluir a conta no Firebase Authentication e marcar `admins/{uid}.active` como `false` por um operador autorizado. O painel observa o documento administrativo e encerra a sessão quando o acesso é revogado.
