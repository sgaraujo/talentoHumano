import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Project } from '../models/types/Project';

class ProjectService {
  private col = 'projects';

  async getAll(): Promise<Project[]> {
    const snap = await getDocs(collection(db, this.col));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Project))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getByCompany(companyId: string): Promise<Project[]> {
    const snap = await getDocs(
      query(collection(db, this.col), where('companyId', '==', companyId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Project))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Busca por companyId Y por companyName para cubrir datos legacy */
  async getByCompanyFull(companyId: string, companyName: string): Promise<Project[]> {
    const [snapId, snapName] = await Promise.all([
      getDocs(query(collection(db, this.col), where('companyId', '==', companyId))),
      getDocs(query(collection(db, this.col), where('companyName', '==', companyName))),
    ]);
    const seen = new Set<string>();
    const all: Project[] = [];
    for (const d of [...snapId.docs, ...snapName.docs]) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        all.push({ id: d.id, ...d.data() } as Project);
      }
    }
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = await addDoc(collection(db, this.col), {
      ...data,
      headcount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, data: Partial<Project>): Promise<void> {
    await updateDoc(doc(db, this.col, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, this.col, id));
  }

  /** Usuarios que tienen este proyecto en su projectIds[] */
  async getMembers(projectId: string): Promise<any[]> {
    const snap = await getDocs(
      query(collection(db, 'users'), where('projectIds', 'array-contains', projectId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /** Proyectos donde un usuario es líder */
  async getByLeader(leaderId: string): Promise<Project[]> {
    const snap = await getDocs(
      query(collection(db, this.col), where('leaderId', '==', leaderId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
  }

  /**
   * Inactiva proyectos donde headcount = 0 o todos los miembros son excolaboradores.
   * Returns count of projects inactivated.
   */
  async syncStatuses(): Promise<{ inactivated: number }> {
    const [allProjects, usersSnap] = await Promise.all([
      this.getAll(),
      getDocs(collection(db, 'users')),
    ]);

    // Build map: projectId → array of member roles
    const projectRoles = new Map<string, string[]>();
    for (const d of usersSnap.docs) {
      const data = d.data();
      const role: string = data.role || 'colaborador';
      const pids: string[] = [...(data.projectIds || [])];
      const assignedPid: string | undefined = data.contractInfo?.assignment?.projectId;
      if (assignedPid && !pids.includes(assignedPid)) pids.push(assignedPid);
      for (const pid of pids) {
        if (!projectRoles.has(pid)) projectRoles.set(pid, []);
        projectRoles.get(pid)!.push(role);
      }
    }

    let inactivated = 0;
    for (const project of allProjects) {
      if (project.status !== 'activo') continue;
      const roles = projectRoles.get(project.id) || [];
      const hc = project.headcount ?? roles.length;
      const allExcol = roles.length > 0 && roles.every(r => r === 'excolaborador');
      if (hc === 0 || allExcol) {
        await this.update(project.id, { status: 'inactivo' });
        inactivated++;
      }
    }

    return { inactivated };
  }
}

export const projectService = new ProjectService();
