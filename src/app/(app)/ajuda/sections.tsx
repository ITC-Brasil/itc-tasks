import { SHORTCUTS } from "@/components/layout/shortcut-list";
import { Kbd } from "@/components/layout/shortcuts";
import {
  type Category,
  GlpiChip,
  PriorityIcon,
  ProjectChip,
  StatusIcon,
  UnitChip,
  glpiUrl,
} from "@/components/tasks/badges";
import { TaskCard } from "@/components/tasks/task-card";
import { Card } from "@/components/ui/card";
import { env, mcpUrl } from "@/lib/env";
import type { TaskRow } from "@/server/services/tasks";
import { CodeBlock } from "./code-block";

// ADR-065: conteúdo do manual aprovado, conferido contra o código; dados de exemplo fixos, nada do banco

function Section({
  id,
  n,
  kicker,
  title,
  children,
}: {
  id: string;
  n: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="flex scroll-mt-4 flex-col gap-3">
      <p className="text-caption text-accent-text uppercase tabular-nums">
        {n} · {kicker}
      </p>
      <h2 id={`${id}-t`} className="text-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <Card padding="sm" className="text-small text-muted">
    {children}
  </Card>
);
const Steps = ({ children }: { children: React.ReactNode }) => (
  <ol className="flex list-decimal flex-col gap-1.5 pl-5">{children}</ol>
);
const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded-sm bg-muted px-1 text-tech break-all">{children}</code>
);
function Items({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map(([t, d]) => (
        <Card key={t} padding="sm">
          <dt className="font-semibold">{t}</dt>
          <dd className="text-small text-muted">{d}</dd>
        </Card>
      ))}
    </dl>
  );
}
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-small">
        <thead>
          <tr className="border-b text-left">
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const STATUSES: [Category, string][] = [
  ["backlog", "Backlog"],
  ["todo", "A fazer"],
  ["in_progress", "Em andamento"],
  ["waiting", "Aguardando"],
  ["done", "Concluído"],
];
const PRIORITIES = [
  ["low", "Baixa"],
  ["medium", "Média"],
  ["high", "Alta"],
  ["urgent", "Urgente"],
] as const;

// exemplo fixo; só os campos que o TaskCard lê
const SAMPLE = {
  number: 142,
  title: "Trocar nobreak do rack 2",
  projects: [{ id: "p", code: "TRL", name: "Transportadora Litoral" }],
  units: ["UM-07"],
  labels: [{ name: "Infra", colorToken: "label-teal" }],
  priority: "high",
  dueDate: "2000-01-01",
  category: "in_progress",
  assigneeInitials: "MS",
  assigneeName: "Pessoa de exemplo",
} as unknown as TaskRow;

function PrimeiroAcesso() {
  return (
    <Section
      id="primeiro-acesso"
      n="01"
      kicker="Primeiro acesso"
      title="Entrar e deixar do seu jeito"
    >
      <p>Não existe cadastro público. O administrador cria a sua conta e passa a senha inicial.</p>
      <Steps>
        <li>Abra o ITC Tasks e entre com o seu e-mail do Grupo ITC e a senha recebida.</li>
        <li>
          Troque a senha inicial em <b>Minhas preferências › Senha</b>. A nova senha precisa ter de
          12 a 128 caracteres. Ao trocar, as suas outras sessões são encerradas e a atual continua
          aberta.
        </li>
        <li>
          Escolha o tema <b>Claro</b> ou <b>Escuro</b> em Minhas preferências (ou no menu do
          usuário). A escolha fica salva na sua conta e vale em qualquer dispositivo.
        </li>
        <li>
          Se o navegador oferecer, instale o app (PWA). Ele abre em janela própria e recebe
          notificações push.
        </li>
      </Steps>
      <Note>
        Esqueceu a senha? Peça ao administrador para redefinir. Depois de 5 tentativas erradas da
        senha atual em 15 minutos, a troca fica bloqueada por 15 minutos.
      </Note>
    </Section>
  );
}

function TelaPrincipal() {
  return (
    <Section
      id="tela-principal"
      n="02"
      kicker="A tela principal"
      title="Minhas tarefas e o menu lateral"
    >
      <p>
        Ao entrar você cai em Minhas tarefas: o que está com você, agrupado por prazo (vencidas,
        hoje, esta semana).
      </p>
      <Items
        items={[
          [
            "Menu lateral",
            <>
              Minhas tarefas, Tarefas, Ciclos, Marcos, Painel, Notificações e Templates; abaixo,
              Configurações (administrador) ou Agentes e MCP e Minhas preferências (membro). Recolha
              ou expanda com <Kbd>[</Kbd>.
            </>,
          ],
          [
            "Criar tarefa",
            <>
              Tecla <Kbd>C</Kbd> em qualquer tela, ou “Criar tarefa” no <Kbd>⌘K</Kbd>.
            </>,
          ],
          [
            "Buscar",
            <>
              <Kbd>⌘K</Kbd> ou <Kbd>Ctrl K</Kbd> procura tarefas e abre telas e ações.
            </>,
          ],
          ["Menu do usuário", "No rodapé do menu: tema, atalhos de teclado, esta ajuda e Sair."],
        ]}
      />
      <h3 className="text-h3">Como ler um card</h3>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <Card padding="md" className="flex flex-col gap-3 text-small">
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Status">
            {STATUSES.map(([c, l]) => (
              <li key={c} className="flex items-center gap-1.5">
                <StatusIcon category={c} />
                {l}
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Prioridade">
            {PRIORITIES.map(([p, l]) => (
              <li key={p} className="flex items-center gap-1.5">
                <PriorityIcon priority={p} />
                {l}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5">
            <ProjectChip code="TRL" name="Transportadora Litoral" />
            <UnitChip code="UM-07" />
            <GlpiChipExample />
          </div>
        </Card>
        <TaskCard task={SAMPLE} today="2000-01-02" />
      </div>
      <p>
        A forma do ícone diz o status mesmo sem cor. A ampulheta é <b>Aguardando</b>: tarefa
        iniciada e parada por algo fora do alcance da equipe (compra a caminho, retorno de
        fornecedor). Ela continua aberta e aparece como atrasada se passar do prazo. As barras
        indicam a prioridade (Baixa, Média, Alta) e o quadrado com <b>!</b> marca Urgente. O prazo
        vencido aparece com o ícone em vermelho. O código <Code>TI-142</Code> é o número da tarefa e
        também o endereço dela: <Code>/tarefas/142</Code>.
      </p>
    </Section>
  );
}

const GlpiChipExample = () => <GlpiChip ticket={48213} href={glpiUrl(env.GLPI_BASE_URL, 48213)} />;

function CriarTarefa() {
  return (
    <Section id="criar-tarefa" n="03" kicker="Criar uma tarefa" title="Criação rápida">
      <p>
        Aperte <Kbd>C</Kbd>, escreva o título, escolha o Projeto/Cliente e envie com <Kbd>⌘↵</Kbd> (
        <Kbd>Ctrl ↵</Kbd>). O resto pode ficar para depois.
      </p>
      <Steps>
        <li>
          <b>Título</b> curto e com verbo: “Trocar nobreak do rack 2”. A descrição é opcional.
        </li>
        <li>
          <b>Projeto/Cliente</b> é obrigatório. Dá para marcar mais de um; o primeiro é o principal.
        </li>
        <li>
          Status, prioridade, <b>responsável</b> e prazo. Ninguém é atribuído automaticamente:
          escolha quem vai fazer.
        </li>
        <li>
          Opcionais: <b>Unidade Móvel</b>, <b>Chamado GLPI</b> (só o número, vira link para o GLPI)
          e <b>Ciclo</b>.
        </li>
        <li>
          Marque <b>Criar outra</b> para cadastrar várias em sequência (Projeto/Cliente, UM e ciclo
          continuam preenchidos), ou use <b>Usar template</b> para partir de um modelo.
        </li>
      </Steps>
      <Note>
        Sem conexão, a criação fica desabilitada para não perder nada. Espere a faixa “Sem conexão”
        sumir e tente de novo.
      </Note>
    </Section>
  );
}

function Visoes() {
  return (
    <Section id="visoes" n="04" kicker="Visões" title="Kanban, Lista e Calendário">
      <p>
        As três mostram as mesmas tarefas com os mesmos filtros. Troque pelas abas no topo ou com{" "}
        <Kbd>V</Kbd> <Kbd>K</Kbd>, <Kbd>V</Kbd> <Kbd>L</Kbd> e <Kbd>V</Kbd> <Kbd>C</Kbd>; os filtros
        continuam.
      </p>
      <h3 className="text-h3">Kanban</h3>
      <p>
        Uma coluna por status. Arraste o card para mudar o status ou a ordem. A coluna Concluído
        mostra as dos últimos 14 dias.
      </p>
      <h3 className="text-h3">Lista</h3>
      <p>
        Tabela com ordenação e seleção. Marque a caixa das linhas e use a barra de ações em massa:
        mover de status, atribuir, mudar a prioridade, mudar o ciclo ou excluir. <b>Excluir</b> só
        aparece quando você pode excluir todas as selecionadas (as que você criou, ou qualquer uma
        se for administrador).
      </p>
      <h3 className="text-h3">Calendário</h3>
      <p>Tarefas pelo prazo e marcos do mês.</p>
      <Note>
        Os filtros ficam no endereço da página: copie o link para mostrar exatamente a mesma visão a
        um colega. Para reusar um filtro, use <b>Salvar filtro atual…</b>.
      </Note>
    </Section>
  );
}

function Detalhe() {
  return (
    <Section id="detalhe" n="05" kicker="Dentro da tarefa" title="O detalhe da tarefa">
      <p>
        À esquerda, o conteúdo e a conversa. À direita, as propriedades, que você edita clicando no
        valor.
      </p>
      <Items
        items={[
          ["Subtarefas", "Lista de verificação com responsável por item e barra de progresso."],
          ["Vínculos", "“Bloqueada por” e “Relacionada” ligam uma tarefa a outra."],
          [
            "Comentários",
            <>
              Use <b>@</b> para mencionar alguém, que recebe um aviso. Envie com <Kbd>⌘↵</Kbd>.
            </>,
          ],
          [
            "Histórico e anexos",
            "Toda mudança fica registrada, inclusive as feitas por agentes (selo “via MCP”). Anexos de até 25 MB.",
          ],
        ]}
      />
      <p>
        <b>Excluir</b> só aparece para o administrador ou para quem criou a tarefa.
      </p>
      <Note>
        A exclusão é definitiva: leva comentários, histórico e anexos, e o número não volta a ser
        usado. Na dúvida, conclua a tarefa em vez de excluir.
      </Note>
    </Section>
  );
}

function Busca() {
  return (
    <Section id="busca" n="06" kicker="Busca e comandos" title="⌘K resolve quase tudo">
      <p>
        Digite parte do título, um <Code>TI-142</Code>, o código de uma UM ou <Code>#48213</Code>{" "}
        para achar pelo chamado GLPI. Também traz ações: “Criar tarefa”, “Abrir ajuda” e o nome de
        qualquer tela para ir até ela.
      </p>
    </Section>
  );
}

function Planejamento() {
  return (
    <Section id="planejamento" n="07" kicker="Planejamento" title="Ciclos, marcos e painel">
      <Items
        items={[
          [
            "Ciclo",
            <>
              Período curto de trabalho, em geral 2 semanas. Qualquer membro planeja. Ao encerrar,
              as tarefas que você marcar passam para o próximo ciclo planejado e as outras ficam sem
              ciclo. Atalho <Kbd>G</Kbd> <Kbd>C</Kbd>.
            </>,
          ],
          [
            "Marco",
            "Entrega com data de um Projeto/Cliente, como “Expansão Base Sul”. Aparece no calendário e mostra quantas tarefas faltam.",
          ],
          [
            "Painel",
            "Números de um projeto: abertas, concluídas, vencidas, tempo médio e distribuição por status e UM.",
          ],
        ]}
      />
    </Section>
  );
}

function Notificacoes() {
  return (
    <Section id="notificacoes" n="08" kicker="Notificações" title="O que avisa, e por onde">
      <p>
        O item Notificações do menu mostra o contador de não lidas. Na tela você filtra Não lidas,
        Todas e Menções.
      </p>
      <Steps>
        <li>
          Em <b>Minhas preferências</b>, escolha por evento: no app, push ou e-mail. O padrão é no
          app para tudo, push para atribuída, menção, prazo hoje e vencida, e e-mail para prazo hoje
          e vencida.
        </li>
        <li>
          O push só sai dentro do seu horário de expediente; fora dele, o aviso fica só no app.
          Ative o push em cada dispositivo. No iPhone, instale o app na tela inicial antes.
        </li>
        <li>
          Não há e-mail a cada evento: às 08:00 sai um resumo diário com o que ficou marcado para
          e-mail, junto com os lembretes de prazo de hoje e das vencidas.
        </li>
      </Steps>
      <p>
        O que você mesmo faz não gera aviso para você. A exceção é o que o seu agente faz pelo MCP,
        que aparece no app para você acompanhar.
      </p>
    </Section>
  );
}

function TemplatesAutomacoes() {
  return (
    <Section
      id="templates-automacoes"
      n="09"
      kicker="Templates e automações"
      title="Menos trabalho repetido"
    >
      <p>
        <b>Templates</b> guardam tarefas que se repetem. O de tarefa já vem com título, prioridade,
        prazo, etiquetas e subtarefas, como “Preparar nova Unidade Móvel”. O de projeto cria várias
        tarefas de uma vez. Projeto/Cliente e UM são pedidos na hora de usar.
      </p>
      <p>
        <b>Automações</b> são regras do tipo “quando acontecer isto, faça aquilo”, como avisar quem
        criou quando a tarefa for concluída ou lembrar de atualizar o GLPI. Elas valem para tarefas
        criadas pela tela e por agentes. Só o administrador cria e liga as regras.
      </p>
    </Section>
  );
}

// ADR-065: cliente novo = mais um item aqui
const CLIENTS: {
  id: string;
  name: string;
  intro: React.ReactNode;
  code: (url: string) => string;
  after?: React.ReactNode;
}[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    intro: "No terminal, na pasta do projeto:",
    code: (url) =>
      `claude mcp add --transport http itc-tasks ${url} \\\n  --header "Authorization: Bearer itct_SEU_TOKEN"`,
    after: (
      <>
        Ou, no arquivo <Code>.mcp.json</Code> do projeto, o bloco abaixo. Para não gravar o token no
        arquivo, troque o valor por <Code>{"Bearer ${ITC_TASKS_TOKEN}"}</Code> e defina a variável
        de ambiente.
      </>
    ),
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    intro: (
      <>
        Em <b>Configurações › Conectores › Adicionar conector personalizado</b>, informe o endereço
        e, em <b>Request headers</b>, o cabeçalho <Code>Authorization</Code> com o valor{" "}
        <Code>Bearer itct_SEU_TOKEN</Code>. Se a seção de cabeçalhos não aparecer, a sua conta ainda
        não tem esse recurso: o conector remoto sem ela só aceita OAuth, que o ITC Tasks não usa.
        Nesse caso, use o Claude Code.
      </>
    ),
    code: (url) => `${url}\nAuthorization: Bearer itct_SEU_TOKEN`,
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    intro: (
      <>
        Em <Code>~/.hermes/config.yaml</Code>, na chave <Code>mcp_servers</Code>:
      </>
    ),
    code: (url) =>
      `mcp_servers:\n  itc_tasks:\n    url: "${url}"\n    headers:\n      Authorization: "Bearer itct_SEU_TOKEN"`,
    after: (
      <>
        Depois de salvar, rode <Code>/reload-mcp</Code> na sessão ou reinicie o Hermes. O Hermes
        filtra ferramentas com <Code>tools.include</Code> e <Code>tools.exclude</Code>, mas para um
        agente só de leitura o certo é o token só com a permissão Ler.
      </>
    ),
  },
];

const TOOLS: [string, string, string][] = [
  [
    "list_tasks",
    "Ler",
    "Lista com filtros: projeto, UM, status, responsável, ciclo, texto ou #GLPI",
  ],
  ["get_task", "Ler", "Uma tarefa completa, por TI-142 ou 142"],
  ["list_projects", "Ler", "Projetos/Clientes ativos"],
  ["list_mobile_units", "Ler", "Unidades Móveis ativas"],
  ["list_cycles", "Ler", "Ciclos, para o agente achar o certo"],
  ["create_task", "Escrever", "Cria a tarefa; sem Projeto/Cliente é recusada"],
  ["update_task", "Escrever", "Muda campos, ciclo e subtarefas"],
  ["add_comment", "Escrever", "Comenta, aceitando menção por e-mail"],
  ["complete_task", "Escrever", "Conclui a tarefa"],
];

function Mcp() {
  const url = mcpUrl();
  const json = `{\n  "mcpServers": {\n    "itc-tasks": {\n      "type": "http",\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer itct_SEU_TOKEN" }\n    }\n  }\n}`;
  return (
    <Section id="mcp" n="10" kicker="Agentes e MCP" title="Integrar o Claude e outros agentes">
      <p>
        O ITC Tasks tem um servidor MCP embutido. Com ele, um agente lista, cria, atualiza, comenta
        e conclui tarefas em seu nome, com as mesmas regras da tela.
      </p>
      <h3 className="text-h3">1. Crie o seu token</h3>
      <Steps>
        <li>
          Vá a <b>Agentes e MCP</b> (administrador: Configurações › Agentes e MCP) e clique em{" "}
          <b>Novo token</b>.
        </li>
        <li>Dê um nome que diga onde ele vai ser usado, por exemplo “Claude · notebook”.</li>
        <li>
          Escolha as permissões: <b>Ler</b> (<Code>tasks:read</Code>) para consultar, e{" "}
          <b>Escrever</b> (<Code>tasks:write</Code>) para criar, atualizar, comentar e concluir.
        </li>
        <li>
          Copie o token na hora. Ele começa com <Code>itct_</Code> e não é mostrado de novo.
        </li>
      </Steps>
      <Note>
        O token é uma senha. Não cole em chat, e-mail, chamado nem repositório. Um token por agente
        ou máquina; se vazar ou não for mais usado, clique em <b>Revogar</b>. Cada pessoa tem até 10
        tokens.
      </Note>
      <h3 className="text-h3">2. Endereço e cabeçalho</h3>
      <p>
        Servidor <Code>{url}</Code>, transporte HTTP. O token vai no cabeçalho{" "}
        <Code>Authorization: Bearer itct_SEU_TOKEN</Code>, em qualquer agente.
      </p>
      <h3 className="text-h3">3. Ferramentas</h3>
      <Table
        head={["Ferramenta", "Permissão", "O que faz"]}
        rows={TOOLS.map(([t, p, d]) => [<Code key={t}>{t}</Code>, p, d])}
      />
      <h3 className="text-h3">4. Regras que valem para o agente</h3>
      <Steps>
        <li>
          Ele age <b>em seu nome</b>: o histórico mostra o selo “via MCP” com o nome do token, e
          você vê no app o que ele fez.
        </li>
        <li>
          As validações são as da tela: Projeto/Cliente obrigatório, cadastros arquivados recusados.
        </li>
        <li>
          Pode usar códigos legíveis: projeto <Code>TRL</Code>, UM <Code>UM-07</Code>, status “Em
          andamento”, responsável pelo e-mail.
        </li>
        <li>
          Agente <b>nunca exclui</b> tarefas. Excluir só pela tela.
        </li>
        <li>Limite de 60 chamadas por minuto por token.</li>
      </Steps>
      <h3 className="text-h3">5. Peça em linguagem natural</h3>
      <Items
        items={[
          [
            "Consultar",
            "“Quais tarefas da Transportadora Litoral vencem esta semana?” · “Resuma a TI-142 e o que falta.”",
          ],
          [
            "Criar",
            "“Crie uma tarefa no projeto TRL para a UM-07, chamado GLPI 48213, prioridade alta, para mim.”",
          ],
          [
            "Atualizar e concluir",
            "“Marque a subtarefa 3 da TI-142 como feita e comente que o túnel subiu.” · “Conclua a TI-131.”",
          ],
        ]}
      />
      <h3 className="text-h3">6. Conecte o seu cliente</h3>
      {CLIENTS.map((c) => (
        <div key={c.id} id={`mcp-${c.id}`} className="flex scroll-mt-4 flex-col gap-2">
          <h4 className="font-semibold">{c.name}</h4>
          <p>{c.intro}</p>
          <CodeBlock code={c.code(url)} label={`configuração do ${c.name}`} />
          {c.after && <p>{c.after}</p>}
          {c.id === "claude-code" && <CodeBlock code={json} label=".mcp.json" />}
        </div>
      ))}
    </Section>
  );
}

function Celular() {
  return (
    <Section id="celular" n="11" kicker="No celular" title="O mesmo app, no bolso">
      <p>
        No celular o menu vira uma barra inferior com <b>Minhas</b>, <b>Tarefas</b>, <b>Criar</b>,{" "}
        <b>Ciclo</b> e <b>Mais</b>. Em Mais ficam as outras telas, o tema, os atalhos, esta ajuda e
        Sair. O Kanban mostra uma coluna por vez (deslize para o lado) e a criação abre num painel
        de baixo.
      </p>
      <Note>
        Instale pelo navegador: no Android, “Instalar app”; no iPhone, Compartilhar › Adicionar à
        Tela de Início. Sem conexão, você vê a última versão salva das telas que já abriu.
      </Note>
    </Section>
  );
}

function Atalhos() {
  return (
    <Section id="atalhos" n="12" kicker="Atalhos" title="Atalhos de teclado">
      <p>
        Aperte <Kbd>?</Kbd> em qualquer tela para ver a lista. Atalhos de uma tecla não funcionam
        enquanto você digita num campo. No Windows, <Kbd>⌘</Kbd> é <Kbd>Ctrl</Kbd>.
      </p>
      <Table
        head={["Atalho", "Ação"]}
        rows={SHORTCUTS.map((s) => [
          <span key={s.label} className="flex gap-1">
            {s.keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </span>,
          s.label,
        ])}
      />
    </Section>
  );
}

function Papeis() {
  return (
    <Section id="papeis" n="13" kicker="Papéis e cadastros" title="Quem pode o quê">
      <Table
        head={["Papel", "Pode"]}
        rows={[
          [
            <b key="m">Membro</b>,
            "Criar e editar qualquer tarefa, excluir as que criou, planejar ciclos e marcos, comentar, usar templates, gerenciar os próprios tokens e preferências",
          ],
          [
            <b key="a">Administrador</b>,
            "Tudo do membro, mais: membros, workflow, cadastros, automações, excluir qualquer tarefa e gerenciar tokens de qualquer pessoa",
          ],
          [
            <b key="g">Agente</b>,
            "As ferramentas MCP permitidas no token, em nome do dono; nunca exclui",
          ],
        ]}
      />
      <p>
        Projetos/Clientes, Unidades Móveis, status e etiquetas ficam em Configurações e são mantidos
        pelo administrador. Cadastros não são excluídos, só arquivados: somem das escolhas, mas as
        tarefas antigas continuam com o nome certo. Falta um projeto ou UM? Peça ao administrador.
      </p>
      <Note>Dúvida ou problema no app? Abra um chamado no GLPI ou fale com o administrador.</Note>
    </Section>
  );
}

export const SECTIONS = [
  { id: "primeiro-acesso", title: "Primeiro acesso", C: PrimeiroAcesso },
  { id: "tela-principal", title: "A tela principal", C: TelaPrincipal },
  { id: "criar-tarefa", title: "Criar uma tarefa", C: CriarTarefa },
  { id: "visoes", title: "Kanban, Lista e Calendário", C: Visoes },
  { id: "detalhe", title: "Dentro da tarefa", C: Detalhe },
  { id: "busca", title: "Busca e comandos", C: Busca },
  { id: "planejamento", title: "Ciclos, marcos e painel", C: Planejamento },
  { id: "notificacoes", title: "Notificações", C: Notificacoes },
  { id: "templates-automacoes", title: "Templates e automações", C: TemplatesAutomacoes },
  { id: "mcp", title: "Agentes e MCP", C: Mcp },
  { id: "celular", title: "No celular", C: Celular },
  { id: "atalhos", title: "Atalhos de teclado", C: Atalhos },
  { id: "papeis", title: "Papéis e cadastros", C: Papeis },
];
