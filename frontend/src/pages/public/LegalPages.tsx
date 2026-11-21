import { type PropsWithChildren, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from '../../ui/kit';

/** Versões precisam bater com CURRENT_LEGAL_VERSIONS no backend. */
export const LEGAL_VERSION = '1.0';
const UPDATED_AT = '21 de novembro de 2026';

function LegalLayout({ title, children }: PropsWithChildren<{ title: string }>) {
  const { hash } = useLocation();
  // Links como /privacidade#armazenamento levam direto à seção.
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="min-h-dvh bg-cream px-4 py-8">
      <article className="mx-auto max-w-3xl">
        <Link to="/" aria-label="LifeHub, página inicial">
          <Logo className="mb-6 h-10 w-auto" />
        </Link>
        <div className="card space-y-4 p-6 leading-relaxed md:p-8 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-extrabold [&_li]:ml-5 [&_li]:list-disc">
          <h1 className="text-3xl font-black">{title}</h1>
          <p className="text-sm text-muted">
            Versão {LEGAL_VERSION} · Atualizado em {UPDATED_AT}
          </p>
          <p className="rounded-xl bg-soft p-3 text-sm">
            O LifeHub é um <strong>projeto acadêmico</strong>. Os dados de demonstração são fictícios. Este texto descreve
            exatamente como o sistema trata os dados.
          </p>
          {children}
        </div>
        <p className="mt-6 text-center">
          <Link to="/" className="font-semibold text-primary underline">Voltar ao LifeHub</Link>
        </p>
      </article>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Termos de Uso">
      <h2>1. O que é o LifeHub</h2>
      <p>
        O LifeHub é uma plataforma para encontrar médicos com CRM verificado e agendar consultas presenciais ou por vídeo,
        para você e para seus dependentes. <strong>O LifeHub não presta atendimento médico</strong> e não substitui o
        atendimento de emergência.
      </p>
      <h2>2. Emergências</h2>
      <p>
        Em caso de emergência, ligue para o <strong>SAMU (192)</strong> ou procure a UPA ou o pronto-socorro mais próximo.
        Não use o LifeHub para situações urgentes.
      </p>
      <h2>3. Sua conta</h2>
      <ul>
        <li>Você deve informar dados verdadeiros, incluindo nome, CPF e data de nascimento.</li>
        <li>A senha é pessoal. Após 5 tentativas erradas, a conta fica bloqueada por 15 minutos.</li>
        <li>Ao cadastrar um dependente, você declara ser responsável legal por ele ou ter a autorização dele.</li>
      </ul>
      <h2>4. Agendamentos</h2>
      <ul>
        <li>O horário só é reservado depois da confirmação. Um mesmo horário não pode ser reservado duas vezes.</li>
        <li>Você pode cancelar uma consulta futura pelo app; o horário volta a ficar disponível.</li>
        <li>Valores exibidos são informados pelo médico e pagos diretamente a ele. O LifeHub não processa pagamentos.</li>
      </ul>
      <h2>5. Médicos</h2>
      <p>
        Médicos só aparecem na busca depois que a equipe do LifeHub confere o CRM e os documentos enviados. O médico é o
        único responsável pelo atendimento que presta.
      </p>
      <h2>6. Uso indevido</h2>
      <p>
        Contas usadas para fraude, cadastro falso ou abuso podem ser bloqueadas pela administração. Todo bloqueio fica
        registrado com o motivo.
      </p>
      <h2>7. Encerramento</h2>
      <p>Você pode excluir sua conta a qualquer momento em <em>Perfil → Privacidade</em>.</p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Política de Privacidade">
      <p>
        Esta política segue a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD). Usamos o mínimo de dados
        necessário para você agendar consultas.
      </p>
      <h2>1. Dados que coletamos</h2>
      <ul>
        <li><strong>Conta:</strong> nome, e-mail, celular, CPF, data de nascimento e senha (guardada só como hash Argon2).</li>
        <li><strong>Dependentes:</strong> nome, data de nascimento, sexo, parentesco e, se você quiser, CPF.</li>
        <li><strong>Consultas:</strong> médico, clínica, serviço, data, situação e motivo de cancelamento.</li>
        <li><strong>Médicos:</strong> CRM, UF, especialidade, apresentação e documentos enviados para verificação.</li>
        <li><strong>Registros técnicos:</strong> sessões de acesso e aceites destes documentos, com data e versão.</li>
      </ul>
      <p>Não coletamos diagnósticos, sintomas, exames ou prontuário.</p>
      <h2>2. Para que usamos</h2>
      <ul>
        <li>Criar e proteger sua conta (execução do contrato, art. 7º, V).</li>
        <li>Agendar, lembrar e cancelar consultas (execução do contrato e consentimento para dados de saúde, art. 11, I).</li>
        <li>Verificar médicos e manter a plataforma segura (legítimo interesse e prevenção à fraude, art. 7º, IX e art. 11, II, g).</li>
        <li>Enviar campanhas de saúde, <strong>somente se você ativar</strong> essa opção.</li>
      </ul>
      <h2>3. Com quem compartilhamos</h2>
      <p>
        O médico que você escolheu vê apenas o <strong>nome e a idade</strong> do paciente e os dados da consulta. Ele não vê
        CPF, data de nascimento nem os demais dependentes. Não vendemos nem compartilhamos dados com terceiros.
      </p>
      <h2>4. Como protegemos</h2>
      <ul>
        <li>CPF criptografado (AES-256-GCM) e identificado por um código irreversível (HMAC-SHA256). Nas telas, aparece mascarado.</li>
        <li>Documentos dos médicos guardados criptografados; o acesso da administração é temporário e registrado.</li>
        <li>Senhas com Argon2, sessões que expiram, limite de tentativas de login e de requisições.</li>
        <li>Cada perfil (paciente, médico, administração) só acessa o que precisa.</li>
      </ul>
      <h2>5. Por quanto tempo</h2>
      <p>
        Enquanto a conta existir. Ao excluir a conta, os dados pessoais são apagados ou anonimizados na hora. Ficam
        apenas registros sem identificação, necessários para a agenda dos médicos e para comprovar os consentimentos.
      </p>
      <h2>6. Seus direitos (art. 18)</h2>
      <ul>
        <li><strong>Acesso e portabilidade:</strong> baixe todos os seus dados em <em>Perfil → Privacidade → Baixar meus dados</em>.</li>
        <li><strong>Correção:</strong> edite seus dados e os dos dependentes no app.</li>
        <li><strong>Eliminação e revogação do consentimento:</strong> exclua a conta em <em>Perfil → Privacidade</em>.</li>
        <li><strong>Comunicações:</strong> ative ou desative e-mails e campanhas a qualquer momento.</li>
      </ul>
      <h2>7. Crianças e adolescentes</h2>
      <p>
        Dados de menores são cadastrados apenas pelo responsável legal, com declaração expressa de responsabilidade, no
        melhor interesse da criança (art. 14).
      </p>
      <h2 id="armazenamento">8. Cookies e armazenamento no navegador</h2>
      <p>
        O LifeHub <strong>não usa cookies de rastreamento, de estatística ou de publicidade</strong>, nem ferramentas de
        terceiros que acompanhem sua navegação. Por isso não pedimos que você aceite ou recuse cookies: o que guardamos
        é só o necessário para o app funcionar, o que a LGPD permite sem consentimento (art. 7º, V, execução do serviço
        que você pediu).
      </p>
      <ul>
        <li>
          <strong>Sessão</strong> (<code>lifehub.accessToken</code> e <code>lifehub.refreshToken</code>): mantêm você
          conectado. São apagados quando você sai da conta.
        </li>
        <li>
          <strong>Aviso visto</strong> (<code>lifehub.avisoArmazenamento</code>): lembra que você já leu o aviso sobre
          armazenamento, para não mostrá-lo de novo.
        </li>
        <li>
          <strong>Tamanho da letra</strong> (<code>lifehub.tamanhoLetra</code>): guarda o tamanho escolhido no botão
          A+.
        </li>
        <li>
          <strong>Mapa permitido</strong> (<code>lifehub.mapaPermitido</code>): lembra que você pediu para ver os
          mapas, para não perguntar de novo.
        </li>
        <li>
          <strong>Arquivos do app</strong> (cache do aplicativo): telas, imagens e fontes, para o LifeHub abrir mais rápido.
          Nenhum dado pessoal ou de saúde fica nesse cache.
        </li>
      </ul>
      <p>
        As fontes e as fotos são servidas pelo próprio LifeHub. Só dois serviços de fora são usados, e nenhum deles
        recebe dados da sua conta: o <strong>ViaCEP</strong>, quando um médico digita o CEP do consultório (só esse
        número é enviado), e o <strong>OpenStreetMap</strong>, que desenha o mapa da clínica. O mapa só é carregado
        depois que você clica em "Mostrar mapa", porque o OpenStreetMap recebe o endereço IP de quem o abre.
      </p>
      <p>
        Você pode apagar tudo isso a qualquer momento saindo da conta ou limpando os dados do site nas configurações do
        navegador.
      </p>
      <h2>9. Contato</h2>
      <p>Encarregado de dados (projeto acadêmico): equipe LifeHub, pelo canal da disciplina.</p>
    </LegalLayout>
  );
}

export function HealthConsentPage() {
  return (
    <LegalLayout title="Consentimento para dados de saúde">
      <p>
        Saber que você (ou um dependente) marcou uma consulta com um médico de determinada especialidade é um{' '}
        <strong>dado pessoal sensível</strong> (LGPD, art. 5º, II). Por isso pedimos seu consentimento específico e destacado.
      </p>
      <h2>Ao consentir, você autoriza que o LifeHub:</h2>
      <ul>
        <li>registre as consultas que você agendar para você e seus dependentes;</li>
        <li>informe ao médico escolhido o nome e a idade do paciente e os dados da consulta;</li>
        <li>envie lembretes e avisos sobre essas consultas.</li>
      </ul>
      <h2>O LifeHub não vai:</h2>
      <ul>
        <li>pedir ou guardar diagnósticos, sintomas, exames ou prontuário;</li>
        <li>usar esses dados para publicidade ou compartilhá-los com terceiros.</li>
      </ul>
      <h2>Revogação</h2>
      <p>
        Você pode revogar este consentimento a qualquer momento excluindo sua conta em <em>Perfil → Privacidade</em>. Sem ele
        não é possível agendar consultas pelo LifeHub.
      </p>
    </LegalLayout>
  );
}
