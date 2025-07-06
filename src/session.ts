interface SessionState {
	defaultInstance?: string;
	defaultBranch?: string;
}

const session: SessionState = {};

export function setDefaultConnection(instance?: string, branch?: string) {
	if (instance) {
		session.defaultInstance = instance;
	}
	if (branch) {
		session.defaultBranch = branch;
	}
}

export function getDefaultConnection(): SessionState {
	return { ...session };
}
