import { Label } from '@/components/ui/label';
import { EyeOff, UserCheck } from 'lucide-react';
import type { ResponseMode } from '@/models/types/Questionnaire';

interface ResponseModeFieldProps {
    value: ResponseMode;
    onChange: (value: ResponseMode) => void;
    // Onboarding necesita saber quién responde para actualizar su perfil.
    anonymousDisabled?: boolean;
}

const OPTIONS: Array<{ value: ResponseMode; title: string; description: string; Icon: typeof EyeOff }> = [
    {
        value: 'identified',
        title: 'Con nombre y correo',
        description: 'Se guarda quién respondió. En el formulario público se piden nombre y correo.',
        Icon: UserCheck,
    },
    {
        value: 'anonymous',
        title: 'Anónima',
        description: 'Las respuestas se guardan sin nombre ni correo de quien responde.',
        Icon: EyeOff,
    },
];

export const ResponseModeField = ({ value, onChange, anonymousDisabled }: ResponseModeFieldProps) => (
    <div className="space-y-2">
        <Label>Modo de respuesta</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {OPTIONS.map(({ value: optValue, title, description, Icon }) => {
                const disabled = optValue === 'anonymous' && anonymousDisabled;
                const selected = value === optValue;
                return (
                    <button
                        key={optValue}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(optValue)}
                        className={`text-left rounded-lg border p-3 transition-colors
                            ${selected ? 'border-[#008C3C] bg-[#008C3C]/5' : 'border-gray-200 hover:border-[#008C3C]/40'}
                            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${selected ? 'text-[#008C3C]' : 'text-gray-400'}`} />
                            <span className="text-sm font-medium text-gray-700">{title}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{description}</p>
                    </button>
                );
            })}
        </div>
        {anonymousDisabled && (
            <p className="text-[11px] text-gray-400">Los cuestionarios de onboarding siempre se responden con nombre y correo.</p>
        )}
    </div>
);
