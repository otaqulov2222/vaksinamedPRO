import React from 'react';
import LegalDocumentScreen from '@/components/LegalDocumentScreen';
import { useApp } from '@/context/AppContext';
import { getTermsDoc } from '@/lib/legalContent';

export default function TermsScreen() {
  const { language } = useApp();
  return <LegalDocumentScreen doc={getTermsDoc(language)} />;
}
