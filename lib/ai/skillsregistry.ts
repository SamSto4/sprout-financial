// skillRegistry.ts

import { skills } from "./skills";
import type { Skill, SkillCategory } from "./skilltypes";

class SkillRegistry {
  private skills: Map<string, Skill>;

  constructor(initialSkills: Skill[]) {
    this.skills = new Map(
      initialSkills.map((skill) => [
        skill.id,
        skill,
      ])
    );
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getRequired(id: string): Skill {
    const skill = this.skills.get(id);

    if (!skill) {
      throw new Error(`Skill "${id}" not found.`);
    }

    return skill;
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  getEnabled(): Skill[] {
    return this.getAll().filter(
      (skill) => skill.enabled !== false
    );
  }

  getByCategory(category: SkillCategory): Skill[] {
    return this.getAll().filter(
      (skill) => skill.category === category
    );
  }

  getByTag(tag: string): Skill[] {
    return this.getAll().filter(
      (skill) => skill.tags?.includes(tag)
    );
  }

  has(id: string): boolean {
    return this.skills.has(id);
  }

  enable(id: string): void {
    const skill = this.getRequired(id);

    skill.enabled = true;
  }

  disable(id: string): void {
    const skill = this.getRequired(id);

    skill.enabled = false;
  }

  register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      throw new Error(
        `Skill "${skill.id}" is already registered.`
      );
    }

    this.skills.set(skill.id, skill);
  }

  unregister(id: string): boolean {
    return this.skills.delete(id);
  }

  search(query: string): Skill[] {
    const normalizedQuery = query.toLowerCase();

    return this.getAll().filter((skill) => {
      return (
        skill.name.toLowerCase().includes(normalizedQuery) ||
        skill.description.toLowerCase().includes(normalizedQuery) ||
        skill.id.toLowerCase().includes(normalizedQuery) ||
        skill.tags?.some((tag) =>
          tag.toLowerCase().includes(normalizedQuery)
        )
      );
    });
  }
}

export const skillRegistry =
  new SkillRegistry(skills);