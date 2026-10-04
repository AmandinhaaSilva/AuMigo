# T13 — Auditoria independente de segurança

Data: 03/10/2026
Responsável: Baluarte — ECO | Segurança de aplicação
Estado: concluída com escopo proporcional por mudança de prioridade do usuário
Modo: revisão somente leitura; nenhuma correção aplicada

## Versão e ambiente verificados

- Projeto: `C:/Users/gusta/OneDrive/Área de Trabalho/PROJETOS/AuFriends/AuMigo`.
- Base Git: `24d2fef574cc8b40658e49ed0b1876467191933c` (`main`).
- Artefato: workspace local não commitado integrado até T12/T17, conforme a nota `Plano-AuFriends-Firebase-20261003` e o `git status` observado no início da T13.
- Firebase local: projeto `demo-aufriends-local`; Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080`, Storage `127.0.0.1:9199`, Hosting `127.0.0.1:5000` e Hub `127.0.0.1:4400`.
- Contas utilizadas pelos verificadores: somente as duas identidades fictícias locais autorizadas. Senhas e tokens não são reproduzidos neste relatório.
- Regras implantadas em produção: **não comprovadas**. A auditoria avaliou apenas os arquivos do workspace carregados nos emuladores.

## Resultado executivo

Não foi identificada falha crítica ou alta nas evidências coletadas. Foram registrados três achados médios, três baixos e observações de implantação. A autorização principal está nas Firestore/Storage Rules, e não apenas no guard da interface. A suíte de Rules passou integralmente e o baseline local foi restaurado e comprovado após a execução.

**Bloqueio para a demonstração local:** não há bloqueio de segurança para uma demonstração restrita a loopback e com dados fictícios. Os achados médios são relevantes antes de exposição pública; App Check, configuração remota, regras efetivamente implantadas, controles de Auth e cabeçalhos da hospedagem permanecem gates de staging/produção.

## Metodologia e limites

Foram mapeados:

- ativos: contas administrativas, autorização `admins/{uid}`, catálogos, imagens, pedidos de adoção, intenções de doação, configuração pública e carrinho;
- perfis: anônimo, sessão sem autenticação válida, usuário autenticado sem autorização, administrador inativo e administrador ativo;
- entradas: formulários públicos/admin, IDs, parâmetros de URL, documentos Firestore, arquivos, `localStorage`/`sessionStorage` e configuração do checkout;
- fronteiras: navegador → Firebase Auth/Rules, Firestore → Storage, UI pública → painel, scripts locais → Admin SDK/emuladores e site → WhatsApp/Google Maps;
- operações sensíveis: login persistente, leitura de dados pessoais, mudança de status, exclusão, alteração de catálogo/configuração, upload e execução de seed privilegiado.

A análise estática cobriu os arquivos de Rules, índices, configuração Firebase, serviços e features web, formulários e scripts de seed. A verificação dinâmica ficou limitada aos emuladores já ativos, à suíte oficial de Rules, aos cabeçalhos do Hosting local e ao verificador T12. Não houve acesso a Firebase remoto, `wa.me`, Google Maps ou outro terceiro; não houve publicação, commit, scanner remoto ou teste destrutivo fora dos emuladores.

Por mudança de prioridade, não foram iniciados novos casos exploratórios após a suíte oficial. Assim, testes de payload XSS em navegador, token deliberadamente corrompido, IDs hostis em submissões, conteúdo binário falsamente rotulado e uma nova execução de `npm audit` ficaram **NÃO EXECUTADOS**. As conclusões desses pontos são estáticas ou herdadas e estão identificadas como tal.

## Matriz de verificação

| Área | Método | Estado | Evidência observada |
|---|---|---:|---|
| Firestore Rules | Dinâmico, emulador | PASSOU | 14/14 cenários; 69 decisões de permissão: 29 permitidas e 40 negadas |
| Storage Rules | Dinâmico, emulador | PASSOU | 7/7 cenários; 25 decisões de permissão: 11 permitidas e 14 negadas |
| Total da suíte Rules | Dinâmico, emulador | PASSOU | 21/21 cenários; 94 decisões: 40 permitidas e 54 negadas; 0 falhas |
| Anônimo | Dinâmico | PASSOU | leitura pública filtrada; criação válida de submissão; leitura/alteração/exclusão de submissão negadas |
| Usuário autenticado não admin | Dinâmico | PASSOU | catálogo privado, submissões, configuração e escritas administrativas negados |
| Administrador inativo | Dinâmico | PASSOU | leituras privadas e escritas administrativas negadas |
| Administrador ativo | Dinâmico | PASSOU | CRUD validado, transições permitidas, leitura privada e upload/exclusão autorizados |
| Sessão inválida/corrompida | Estático/indireto | NÃO EXECUTADO | ausência de sessão cai no fluxo anônimo; token deliberadamente inválido não foi injetado nesta T13 |
| Leitura pública mínima | Estático + dinâmico | PASSOU COM RESSALVA | somente animal publicado, produto ativo, `siteSettings/public` e mídia em caminhos públicos; ver S04 e O01 |
| `adoptionRequests`/`donations` | Estático + dinâmico | PASSOU COM RESSALVA | create-only público, campos exatos, timestamps do servidor, dados pessoais privados e transições admin; ver S01/S02 |
| Tipos, allowlists e imutabilidade | Estático + dinâmico | PASSOU | campos extras, estados internos, transições inválidas, `createdAt` mutável e `admins` via Web SDK foram negados |
| Índices | Dinâmico | PASSOU | quatro consultas contratuais executaram no emulador |
| Uploads | Estático + dinâmico | PASSOU COM RESSALVA | path, UUID, extensão, MIME declarado, tamanho, arquivo vazio, SVG e perfis verificados; ver S04/S05 |
| XSS/injeção/IDs | Estático | PASSOU COM RESSALVA | dados dinâmicos são inseridos majoritariamente com `textContent`; `innerHTML` recebe apenas templates constantes; ver S01/S03 |
| Checkout WhatsApp | Estático | PASSOU | destino fixado em `https://wa.me`, número somente dígitos, único parâmetro `text`, preços relidos do Firestore e carrinho preservado; nenhum acesso a `wa.me` |
| `localStorage`/`sessionStorage` | Estático | PASSOU COM RESSALVA | carrinho guarda somente IDs/quantidades saneados e não é autoridade de preço; antirreenvio é apenas controle de UX, ver S02 |
| Seed/Admin SDK | Dinâmico | PASSOU | preflight local, recusa de credencial/configuração/host/projeto remoto e T12 14/14 |
| Cabeçalhos HTTP | Dinâmico local | FALHOU | `/admin/painel` respondeu 200 sem CSP, `frame-ancestors`, X-Frame-Options, `nosniff`, Referrer-Policy ou Permissions-Policy; ver S03 |
| `npm audit` atual | Herdado | NÃO EXECUTADO | a nota registra quatro alertas altos transitivos em `grpc`; não houve nova confirmação por ordem de encerramento |

## Achados

### S01 — IDs de submissões públicas não são validados pelas Rules — MÉDIA

**Condição.** `firestore.rules` define `isSafeDocumentId`, mas os blocos `adoptionRequests/{requestId}` e `donations/{donationId}` autorizam `create` sem validar a variável do caminho. O cliente normal gera IDs controlados, porém um chamador direto do SDK pode escolher qualquer ID aceito pelo Firestore. Em contraste, os serviços administrativos recusam IDs fora de `^[A-Za-z0-9_-]{1,128}$` antes de atualizar ou excluir.

**Impacto.** Um anônimo pode inserir payload válido sob ID incompatível com o painel. O registro permanece privado, mas pode virar lixo persistente que a UI administrativa não consegue tratar ou excluir, ampliando spam e custo operacional.

**Evidência sanitizada.** Análise estática de `firestore.rules` (helpers e matches de submissão), `web/src/services/adoptions-data.js` e `web/src/services/donations-data.js`. O caso hostil não foi executado após a redução de escopo.

**Justificativa.** Gravidade média porque a escrita é anônima e persistente; validação estrita do payload e ausência de leitura pública limitam confidencialidade e execução de código.

**Correção proposta.** Exigir `isSafeDocumentId(requestId)` e `isSafeDocumentId(donationId)` no `allow create`. Considerar uma ferramenta administrativa tolerante para remover registros legados fora do padrão.

**Regressão proposta.** Provar que UUID/ID seguro cria uma vez; IDs com 129 caracteres, caracteres fora da allowlist e tentativa de sobrescrita são negados; o admin consegue tratar/excluir todo ID que as Rules aceitam.

### S02 — Antispam público é contornável e App Check está pendente — MÉDIA

**Condição.** Pedidos de adoção e doações são escritos anonimamente por desenho. Honeypot, tempo mínimo e bloqueio de repetição ficam no navegador (`sessionStorage`/controle de tentativa) e não existem nas Rules. Um cliente direto ignora esses controles. Não há App Check inicializado/enforced nesta versão local nem rate limit mediado por backend.

**Impacto.** Após publicação, automação pode gerar spam, consumir quota/custo do Firestore e sobrecarregar a fila que contém dados pessoais. App Check reduz clientes não legítimos, mas não substitui rate limiting nem validação.

**Evidência sanitizada.** `allow create` público em `firestore.rules`; gates locais em `adoption-attempt.js`, `donation-attempt.js`, `adoptions-data.js` e `donations-data.js`; ausência de inicialização App Check em `firebase-local.js`. Não foi executada carga ou abuso ativo.

**Justificativa.** Média para uma implantação pública pela facilidade e impacto de disponibilidade/custo; não bloqueia loopback sem tráfego externo.

**Correção proposta.** Antes de produção, habilitar e monitorar App Check, configurar quotas/alertas e decidir se submissões exigem endpoint com limite por origem/device/tempo. Preservar as validações das Rules como última fronteira.

**Regressão proposta.** Em staging autorizado, cliente legítimo com App Check envia; token ausente/inválido é recusado após enforcement; rajada acima do limite recebe bloqueio sem gravar PII; submissão comum continua funcional.

### S03 — Painel pode ser enquadrado e não há política de segurança de conteúdo — MÉDIA

**Condição.** `firebase.json` não configura cabeçalhos de segurança. A resposta local de `/admin/painel` continha somente cabeçalhos básicos e não apresentou CSP com `frame-ancestors`, X-Frame-Options, `X-Content-Type-Options`, Referrer-Policy ou Permissions-Policy.

**Impacto.** Quando publicado, o painel autenticado poderá ser incorporado por uma origem maliciosa e exposto a clickjacking. A ausência de CSP também remove uma barreira importante contra futuras injeções, embora os sinks atuais revisados usem `textContent` para conteúdo dinâmico.

**Evidência sanitizada.** Inspeção estática de `firebase.json` e resposta HTTP local `200 OK` de `/admin/painel` sem os cabeçalhos citados.

**Justificativa.** Média pelo potencial de ação administrativa induzida; requer sessão administrativa e interação da vítima, e não foi demonstrado exploit.

**Correção proposta.** Definir cabeçalhos no Firebase Hosting, no mínimo CSP compatível com Firebase e mapa escolhido, `frame-ancestors 'none'`, fallback X-Frame-Options `DENY`, `nosniff`, Referrer-Policy restritiva e Permissions-Policy mínima. Validar a política em report-only antes de enforcement.

**Regressão proposta.** Verificar cabeçalhos no Hosting de staging e confirmar que uma página de outra origem não consegue enquadrar `/admin/painel`; executar os fluxos Firebase sob a CSP final sem violações inesperadas.

### S04 — Leitura de mídia pública não acompanha publicação/atividade do documento — BAIXA

**Condição.** `storage.rules` libera leitura pela forma do caminho/nome, sem exigir que o animal esteja publicado, o produto ativo ou que o caminho seja a imagem atualmente referenciada. O cliente tenta apagar a mídia substituída, mas admite warning quando a limpeza falha.

**Impacto.** Quem conhece a URL/caminho pode continuar lendo imagem órfã, substituída, de animal oculto ou de produto inativo. O conteúdo atual é catálogo público, reduzindo sensibilidade.

**Evidência sanitizada.** Matches públicos em `storage.rules`; ciclos de substituição/exclusão em `adoptions-data.js` e `products-data.js`.

**Correção proposta.** Vincular o `allow read` ao documento correspondente (`published`/`active` e `imagePath` igual ao objeto) ou adotar processo confiável de revogação/limpeza. Definir retenção de mídias órfãs.

**Regressão proposta.** Imagem atual de item público é permitida; objeto de item oculto/inativo, caminho antigo e objeto sem documento correspondente são negados.

### S05 — Validação de upload confia no MIME declarado, não nos bytes — BAIXA

**Condição.** Storage Rules validam tamanho, extensão UUID e `contentType`, mas não assinatura/decodificação do arquivo. O navegador normalmente converte imagens por canvas, porém há fallback para o arquivo original quando APIs de imagem não estão disponíveis. SVG é negado.

**Impacto.** Um administrador comprometido pode armazenar bytes não correspondentes ao tipo declarado. O uso apenas em `<img>`, a exclusão de SVG e a necessidade de admin ativo reduzem a explorabilidade no site atual, mas conteúdo inválido pode afetar consumidores futuros.

**Evidência sanitizada.** `storage.rules`, `optimizeCatalogImage` e `optimizeProductImage`; a suíte confirmou recusa de MIME SVG, vazio e tamanho acima de 5 MiB, não a assinatura binária.

**Correção proposta.** Se a ameaça justificar, fazer decodificação/transcodificação confiável no servidor antes de publicar o objeto e remover o original; não confiar só em nome/MIME.

**Regressão proposta.** Arquivo textual rotulado como JPEG é recusado; JPEG/PNG/WebP reais são decodificados, regravados e permanecem dentro do limite.

### S06 — Mapa de terceiro carrega sem escolha prévia do visitante — BAIXA (privacidade)

**Condição.** `web/sobre/index.html` inclui iframe direto do Google Maps. Não há etapa de clique/consentimento e a política de referrer configurada não é a mais restritiva.

**Impacto.** Abrir a página pode compartilhar IP e metadados de navegação com terceiro antes de uma ação explícita. Nenhum dado de formulário é enviado ao iframe pelo código revisado.

**Evidência sanitizada.** Análise estática do iframe; o endpoint externo não foi acessado nesta auditoria.

**Correção proposta.** Preferir mapa estático/local ou carregamento somente após ação informada; usar `referrerpolicy="no-referrer"`, permissões mínimas e avaliar sandbox compatível.

**Regressão proposta.** Confirmar em tráfego de staging autorizado que nenhuma requisição a terceiro ocorre antes do opt-in/clique.

## Observações sem vulnerabilidade confirmada

### O01 — Metadado `updatedBy` é público

Animais, produtos e `siteSettings/public` incluem o UID estável do administrador no mesmo documento lido publicamente. Não é segredo nem concede acesso, mas é exposição desnecessária de identificador interno. Para minimização, mover trilha de auditoria a documento privado ou usar identificador não sensível. Severidade informativa.

### O02 — Dependências com alerta herdado, sem reconfirmação T13

A nota da sessão registra quatro alertas `high` transitivos em `grpc` para `npm audit --omit=dev`, ausentes do bundle web, e correção automática incompatível. Por encerramento antecipado, T13 não executou `npm audit`; portanto, versão afetada, alcance e explorabilidade não foram reconfirmados. Classificação operacional provisória: **média pendente de triagem**, não uma vulnerabilidade alta confirmada no navegador.

Próximo teste recomendado: executar `npm audit --omit=dev` e `npm explain` em clone limpo da mesma versão, identificar o caminho carregado em runtime, buscar atualização compatível e repetir build/suítes. Não aplicar `npm audit fix --force` nem downgrade incompatível sem revisão.

### O03 — Credenciais e separação local/remota

As credenciais encontradas são fixtures fictícias locais. O adaptador web recusa projeto/origem fora de loopback; o preflight de seed recusa credencial externa, configuração Firebase externa, projeto/host remoto e só então configura o Admin SDK para os emuladores. A chave pública do SDK web não foi tratada como segredo. O verificador T12 confirmou esses guardrails.

### O04 — Checkout e carrinho

O carrinho persiste somente IDs e quantidades saneados, relê produtos ativos/preços no Firestore e calcula em inteiros. A URL de checkout é construída e revalidada para `https://wa.me/<10-15 dígitos>?text=...`, abre uma janela inicialmente neutra e remove `opener`. Não há gravação de pedido, dado financeiro ou Pix no site. Nenhuma navegação externa foi realizada.

## Baseline restaurado

`npm run test:rules` limpa Firestore/Storage como parte do isolamento. Após a suíte, foi executado exclusivamente `npm run seed:emulators`, seguido de `npm run verify:t12`.

Resultado final observado: T12 14/14, zero falhas; duas contas Auth fictícias, um admin ativo, três animais, sete produtos, dez mídias, `siteSettings/public`, zero pedidos de adoção e zero doações. A sentinela do verificador foi removida. Assim, o estado aceito da demonstração local foi restaurado.

## Riscos aceitos para a demonstração local

- App Check ainda ausente, aceitável apenas enquanto todos os serviços permanecem em loopback.
- Alertas transitivos de dependência permanecem pendentes de triagem independente; evidência existente indica ausência no bundle web, mas isso deve ser reconfirmado antes da publicação.
- Credenciais fictícias versionadas são aceitáveis apenas para `demo-aufriends-local`; não podem ser promovidas nem reutilizadas remotamente.
- Mídias e configuração são públicas por contrato; os riscos S04/O01 devem ser aceitos conscientemente ou corrigidos antes de produção.

## Lacunas obrigatórias antes de produção

- Confirmar em projeto autorizado quais Firestore/Storage Rules e índices estão realmente implantados.
- Configurar e validar App Check, quotas, alertas de abuso e resposta a incidentes.
- Validar Auth remoto: administradores reais, política de senha, MFA conforme risco, enumeração de e-mail, domínios autorizados, revogação/desativação e recuperação.
- Aplicar e testar cabeçalhos de segurança/CSP no Hosting.
- Definir retenção e exclusão de dados pessoais e mídias, acesso administrativo mínimo e trilha de auditoria.
- Reexecutar auditoria de dependências e confirmar alcance dos alertas.
- Testar staging com as quatro classes de sessão, IDs hostis, payloads de injeção, binários falsamente rotulados e controles de abuso.

Esta auditoria aprova somente o escopo e a versão local descritos; não certifica ausência universal de vulnerabilidades nem o estado de uma implantação remota.
