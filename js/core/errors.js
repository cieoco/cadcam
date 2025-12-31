/**
 * Error Taxonomy
 * Core error codes for UI and logging.
 */

export const ErrorCodes = {
    INVALID_PARAMS: 'invalid_params',
    INFEASIBLE: 'infeasible',
    INVALID_TOPOLOGY: 'invalid_topology',
    UNKNOWN: 'unknown'
};

export function toUserMessage(code) {
    switch (code) {
        case ErrorCodes.INVALID_PARAMS:
            return 'Invalid parameters, adjust values.';
        case ErrorCodes.INFEASIBLE:
            return 'Geometry infeasible for current parameters.';
        case ErrorCodes.INVALID_TOPOLOGY:
            return 'Invalid topology definition.';
        default:
            return 'Unknown error.';
    }
}
