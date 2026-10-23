# Ferramentas do administrador (Cloud Shell)

Para achar e recuperar a conta de alguém (por exemplo, quem perdeu o celular e nunca criou conta). Rodam no **Cloud Shell** do dono (https://shell.cloud.google.com/?project=mare-hidratacao), que já está logado na conta Google do projeto.

Regras que valem para as três:

- **Nenhuma apaga contas nem registros.** As que gravam algo (`attach-email` e `migrate-days`) só gravam com `--apply`; sem ele, mostram o que fariam e o comando exato para gravar.
- **Para gravar, só vale o uid inteiro** (o da prévia). Apelido e começo do uid servem para olhar, nunca para gravar: eles podem apontar para outra conta.
- Senhas nunca são lidas, mostradas nem guardadas. E-mails saem mascarados (`ma***@gmail.com`), exceto o que você mesmo digitou na prévia.
- Foram testadas contra o emulador do Firestore e um Auth de mentira, **nunca contra o projeto de verdade**. A primeira vez no projeto real é sempre a prévia (que só lê).

Preparo (uma vez, e depois de cada `git pull` que mude `functions/package.json`):

```bash
# só se a pasta ainda não existir:  git clone https://github.com/chrismello0211/mare.git ~/mare
cd ~/mare && git pull && cd functions && npm install && cd ..
```

Apelido com espaço precisa de aspas: `"Mari Souza"`.

## Qual usar

1. Sempre comece com o **`inspect`**: ele mostra quem é quem e o uid de cada conta.
2. A pessoa **nunca criou conta** e perdeu o celular (o caso mais comum): **`attach-email`**. Ela volta com a mesma conta: registros, amigos e turma.
3. A pessoa **já criou uma conta nova** no aparelho novo (o e-mail já está em uso): **`migrate-days`**. Copia os registros da conta antiga para a nova; amigos e turma ela refaz pelo código do convite.

## 1. `inspect.mjs`: quem é quem

```bash
node scripts/admin/inspect.mjs                    # as contas com registros, apelido ou amigos
node scripts/admin/inspect.mjs --name mari        # só as de apelido parecido (sem acento, sem maiúscula)
node scripts/admin/inspect.mjs --friends          # com a lista de amigos de cada uma
node scripts/admin/inspect.mjs --all              # inclui as contas vazias
```

Mostra, por conta: apelido nos Amigos, tipo de login (anônimo, e-mail e senha…), quantos dias de registro e de quando a quando, se há ajustes guardados, quantos amigos e quando foi vista. **Só nomes e contagens**: nada de volumes bebidos, peso ou horários. O `uid` de cada uma aparece na última linha do bloco.

Se aparecer **"sem login (o login foi apagado; só restam os dados)"**, a conta perdeu o login no Firebase (por exemplo, por uma limpeza automática de contas anônimas), mas os registros continuam lá. O `attach-email` consegue recriar o login (veja `--recreate-login`).

## 2. `attach-email.mjs`: recuperar uma conta anônima (o caso "perdi o celular")

Liga o e-mail da pessoa ao **mesmo uid** da conta antiga. Depois, no aparelho novo, ela usa **"Esqueci a senha"** no Maré, cria a própria senha e entra: registros, amigos e turma voltam como estavam. Eu nunca vejo nem defino a senha dela.

```bash
node scripts/admin/attach-email.mjs <uid | começo do uid | apelido> <e-mail>      # prévia (não muda nada) e imprime o comando exato para gravar
node scripts/admin/attach-email.mjs <uid inteiro> <e-mail> --apply                # grava e confere
```

A prévia mostra o apelido, o tipo de login, **quando a conta foi criada e usada pela última vez**, os amigos e os dias de registro: confira se é MESMO a conta da pessoa antes de gravar. Conta com apelido igual ao de outra: ele para e lista as candidatas.

O comando recusa (e explica) quando: o e-mail não parece certo; a conta já tem login por Google; a conta não tem registros na nuvem (use `--even-empty` se for mesmo essa); a conta já tem outro e-mail (use `--replace`); ou o **e-mail já é de outra conta**, o que costuma significar que a pessoa já criou uma conta nova no aparelho novo. Nesse caso use o plano B (`migrate-days`, abaixo).

Opções:

- `--even-empty`: aceita uma conta sem registros na nuvem.
- `--replace`: troca um e-mail que a conta já tenha (nunca troca login do Google).
- `--with-temp-password`: além do e-mail, a conta ganha uma **senha aleatória que ninguém conhece** (não é mostrada nem guardada). Só serve se o Firebase não aceitar o "Esqueci a senha" para uma conta sem senha; a pessoa continua definindo a dela pelo link.
- `--recreate-login`: para a conta "sem login": recria o login com o **mesmo uid** e o e-mail, e os dados continuam ligados a ele.
- `--forget-devices`: tira da conta os avisos push do aparelho antigo (o aparelho novo registra o dele quando a pessoa ligar os lembretes). Mexe só nisso.

Depois de gravar, o comando confere que o Firebase reconhece o e-mail para redefinir a senha (o link gerado nessa conferência é jogado fora: não é mostrado nem enviado). Códigos de saída: **0** deu certo; **1** não deu (explica); **3** a prévia achou um impedimento; **4** o e-mail ficou gravado, mas o Firebase não aceitou gerar o link de senha (confira se "E-mail/senha" está ativado em Authentication → Método de login no console do Firebase e repita o mesmo comando, que só confere de novo; se continuar, repita com `--with-temp-password`).

Essa conferência **não prova que o e-mail chega**: ele sai de `noreply@mare-hidratacao.firebaseapp.com` e pode cair no **spam**. Se em 5 minutos não aparecer, use o plano B.

**Passo a passo para a pessoa** (no celular novo, com o Maré já na Tela de Início, na versão 1.3.0 ou mais nova):

1. Abrir o Maré → na tela de boas-vindas, tocar em **"Entrar na conta"** (logo abaixo do botão "Começar"). **Não** tocar em "Começar" nem em "Criar conta". (Se ela já passou das boas-vindas: Ajustes → **Já tenho conta**; depois que a senha for conferida, os registros do aparelho novo, que ainda não valem nada, são trocados pelos da conta. Com a senha errada, nada sai do aparelho.)
2. **"Esqueci a senha"** → digitar o e-mail → **"Enviar o link"**.
3. Abrir o e-mail (olhar também o **spam**), tocar no link e criar a senha. A página é do próprio Firebase, em português.
4. Voltar ao Maré → **"Já criei a senha, entrar"** → e-mail e senha → **Entrar**.
5. Sem ajustes guardados na nuvem (conta antiga que nunca teve e-mail), o app devolve os **registros**, os **horários de acordar e dormir**, a **unidade**, o **apelido e o mascote dos Amigos**, e pede de novo o **peso e a atividade**. O que só existia no aparelho quebrado (peso, copos favoritos, tema) não volta.

## 3. `migrate-days.mjs`: plano B (copiar os registros de uma conta para outra)

Quando a pessoa já criou uma conta nova no aparelho novo (e-mail já usado) ou quando não dá para usar o plano acima. A conta **antiga é a origem**, a **nova é o destino**.

```bash
node scripts/admin/migrate-days.mjs <origem> <destino>                    # prévia (e o comando exato para copiar)
node scripts/admin/migrate-days.mjs <uid origem> <uid destino> --apply    # copia (só com os uids inteiros)
```

Copia os dias que faltam, **junta** os dias que os dois lados têm (une os registros pelo id, sem duplicar; **se o mesmo registro existe nos dois lados, vale o do destino**; a meta do destino também) e deixa como está o dia que o destino já tem completo. O destino precisa ter login (a origem pode ser uma conta "sem login").

Segurança: um dia que o destino ainda não tinha só é criado se continuar inexistente na hora de gravar; um dia juntado só é alterado se continuar como a prévia o leu. Se a pessoa registrar algo no meio da cópia, o comando para com a mensagem "O destino mudou durante a cópia" e **é seguro repetir**: ele recalcula e continua de onde parou. Rodar de novo depois de terminar não grava nada.

**Não copia** amigos nem a turma (a pessoa os refaz pelo código do convite) e **não apaga** nada na origem. Peça para a pessoa **fechar o Maré de vez** (tirar da lista de aplicativos abertos) e abrir de novo **sem registrar nada antes**: os registros chegam sozinhos na abertura.

## O que não volta (nenhuma das duas)

Peso, copos favoritos e tema escuro, quando só existiam no aparelho quebrado e a conta nunca guardou ajustes na nuvem. A partir da 1.3.0, quem tem conta com e-mail e senha guarda esses ajustes na nuvem e os recupera sozinho.

## Se aparecer erro de permissão

O Cloud Shell já está logado na sua conta Google (dona do projeto). As ferramentas apontam sozinhas para o projeto `mare-hidratacao`. Se mesmo assim aparecer "PERMISSION_DENIED" ou algo sobre "projeto de cota", abra o Cloud Shell pelo link do início (que fixa o projeto) e repita o comando; se persistir, copie a mensagem inteira para mim.

## Testes

`npm run test:rules` roda `tests/rules/admin-tools.test.js` (Admin SDK de verdade contra o emulador do Firestore, com um Auth de mentira em memória).
