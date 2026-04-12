/**
 * Orchestrator Integration Tests
 * --------------------------------
 * 4-Team 오케스트레이터 전체 플로우 검증.
 */

import { classifyInput, routeToTeams } from '../teams/team-registry';

describe('Input Classification', () => {
  test('DXF file → sld_dxf', () => {
    expect(classifyInput('application/dxf', 'drawing.dxf')).toBe('sld_dxf');
  });

  test('DXF with layout keywords → layout_dxf', () => {
    expect(classifyInput('application/dxf', 'drawing.dxf', '평면도 배선')).toBe('layout_dxf');
  });

  test('PDF file → sld_pdf (default)', () => {
    expect(classifyInput('application/pdf', 'drawing.pdf')).toBe('sld_pdf');
  });

  test('PDF with layout keywords → layout_pdf', () => {
    expect(classifyInput('application/pdf', 'layout.pdf', 'floor plan')).toBe('layout_pdf');
  });

  test('Image → sld_image (default)', () => {
    expect(classifyInput('image/png', 'sld.png')).toBe('sld_image');
  });

  test('Image with layout keywords → layout_image', () => {
    expect(classifyInput('image/jpeg', 'plan.jpg', '평면도')).toBe('layout_image');
  });

  test('No file → text_query', () => {
    expect(classifyInput(undefined, undefined, 'KEC 232.52')).toBe('text_query');
  });

  test('Text + file → mixed', () => {
    expect(classifyInput(undefined, undefined, '전압강하 계산')).toBe('text_query');
  });
});

describe('Team Routing', () => {
  test('SLD input → TEAM-SLD primary', () => {
    const routing = routeToTeams('sld_dxf');
    expect(routing.primaryTeam).toBe('TEAM-SLD');
    expect(routing.supportTeams).toContain('TEAM-STD');
    expect(routing.requiresConsensus).toBe(true);
  });

  test('Layout input → TEAM-LAYOUT primary', () => {
    const routing = routeToTeams('layout_image');
    expect(routing.primaryTeam).toBe('TEAM-LAYOUT');
    expect(routing.supportTeams).toContain('TEAM-STD');
  });

  test('Text query → TEAM-STD primary, no consensus', () => {
    const routing = routeToTeams('text_query');
    expect(routing.primaryTeam).toBe('TEAM-STD');
    expect(routing.requiresConsensus).toBe(false);
  });

  test('Mixed → TEAM-STD primary with all support teams', () => {
    const routing = routeToTeams('mixed');
    expect(routing.primaryTeam).toBe('TEAM-STD');
    expect(routing.supportTeams).toContain('TEAM-SLD');
    expect(routing.supportTeams).toContain('TEAM-LAYOUT');
    expect(routing.requiresConsensus).toBe(true);
  });
});

describe('Team Registry', () => {
  test('getAllTeams returns 4 teams', () => {
    const { getAllTeams } = require('../teams/team-registry');
    expect(getAllTeams()).toHaveLength(4);
  });

  test('consensus required teams = 3', () => {
    const { getConsensusRequiredTeams } = require('../teams/team-registry');
    const teams = getConsensusRequiredTeams();
    expect(teams).toHaveLength(3);
    expect(teams).toContain('TEAM-SLD');
    expect(teams).toContain('TEAM-LAYOUT');
    expect(teams).toContain('TEAM-STD');
  });

  test('each team has config', () => {
    const { getTeamConfig } = require('../teams/team-registry');
    const teams = ['TEAM-SLD', 'TEAM-LAYOUT', 'TEAM-STD', 'TEAM-CONSENSUS'] as const;
    for (const id of teams) {
      const config = getTeamConfig(id);
      expect(config.id).toBe(id);
      expect(config.name).toBeTruthy();
      expect(config.nameKo).toBeTruthy();
      expect(config.timeoutMs).toBeGreaterThan(0);
    }
  });

  test('each team has capabilities', () => {
    const { getTeamCapability } = require('../teams/team-registry');
    const teams = ['TEAM-SLD', 'TEAM-LAYOUT', 'TEAM-STD', 'TEAM-CONSENSUS'] as const;
    for (const id of teams) {
      const cap = getTeamCapability(id);
      expect(cap.teamId).toBe(id);
      expect(cap.tools.length).toBeGreaterThan(0);
      expect(cap.dataScope.length).toBeGreaterThan(0);
    }
  });
});

describe('Consensus Team', () => {
  test('computeScore returns 50 for 0 checks', async () => {
    const { executeConsensusTeam } = require('../teams/consensus-team');
    const { teamResult } = await executeConsensusTeam({
      sessionId: 'test',
      projectName: 'Test',
      projectType: 'Test',
      teamResults: [],
    });
    expect(teamResult.success).toBe(true);
    // 0 checks → default 50 score
  });

  test('generates markings from violations', async () => {
    const { executeConsensusTeam } = require('../teams/consensus-team');
    const { report } = await executeConsensusTeam({
      sessionId: 'test',
      projectName: 'Test',
      projectType: 'Test',
      teamResults: [{
        teamId: 'TEAM-STD',
        success: true,
        confidence: 0.9,
        durationMs: 100,
        calculations: [
          { id: 'c1', calculatorId: 'vd', label: 'VD', value: 4.5, unit: '%', compliant: false, standardRef: 'KEC 232.52' },
        ],
        violations: [
          { id: 'v1', severity: 'critical', title: 'VD exceeded', description: '4.5% > 3%' },
        ],
      }],
    });
    expect(report.markings.length).toBeGreaterThan(0);
    expect(report.verdict).toBe('FAIL');
  });
});
