import { typography, spacing, colors, shadow } from '../../constants/theme';
import { changePhoto } from '../../utils/photos';
import Avatar from "../../components/Avatar";
import QrCardPanel, { QrAction, QrActionGrid, QrOwnerSummary } from "../../components/QrCardPanel";
import BrandHeader from "../../components/BrandHeader";
import useResidentProfile from "../../hooks/useResidentProfile";
import ScreenState from "../../components/ScreenState";
import { api } from '../../services/api';
import { alertStageLabel } from '../../utils/models';
import { exportQrCard } from '../../services/qrCardExport';
import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Text from "../../components/AppText";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from "../../contexts/AppDataContext";
import TabBar from "../../components/tabs/TabButtons";
import AppModal from "../../components/modals/AppModal";
import ReasonPromptModal from "../../components/modals/ReasonPromptModal";
import { Divider } from "../../components/ui";
import { FontAwesome5 } from '@expo/vector-icons';

const RELATIONSHIPS = ['Parent', 'Grandparent', 'Child', 'Grandchild', 'Sibling', 'Spouse', 'Guardian'];
const PENDING = 'BACKEND_UPDATE_PENDING';

export default function ProfileScreen({ route, navigation }) {
  // Loaded from the backend on every focus, so edits and guardian links show up.
  const { resident, setResident, alerts: residentAlerts, loading, error, refresh } = useResidentProfile(route);
  const { setResidentPhoto } = useAppData();
  const residentId = route.params?.residentId || route.params?.resident?.id;

  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState(null);          // card issued or exported in this session
  const [qrStatus, setQrStatus] = useState({ unavailable: true, card: null });
  const [qrBusy, setQrBusy] = useState(false);
  const qrRef = useRef(null);

  const [links, setLinks] = useState({ unavailable: true, links: [] });
  const [guardians, setGuardians] = useState([]);
  const [guardianAccountStatuses, setGuardianAccountStatuses] = useState(new Map());
  const [linkBusy, setLinkBusy] = useState(false);
  const [modal, setModal] = useState(null);             // { title, message, actions }
  const [linkForm, setLinkForm] = useState(null);       // { guardianId, relationship }
  const [guardianApprovalConfirmed, setGuardianApprovalConfirmed] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState(null);

  const loadExtras = useCallback(async () => {
    if (!residentId) return;
    const [cardResult, linkResult, accountStatuses] = await Promise.all([
      api.getResidentQrCard(residentId).catch(() => ({ unavailable: true, card: null })),
      api.listResidentGuardianLinks(residentId).catch(() => ({ unavailable: true, links: [] })),
      api.listAccountStatus().catch(() => null),
    ]);
    setQrStatus(cardResult);
    const statusMap = accountStatuses instanceof Map ? accountStatuses : new Map();
    setGuardianAccountStatuses(statusMap);
    setLinks({
      ...linkResult,
      links: linkResult.links.map((link) => {
        const accountStatus = statusMap.get(link.guardianId);
        return accountStatus ? { ...link, ...accountStatus } : link;
      }),
    });
  }, [residentId]);

  useFocusEffect(useCallback(() => { loadExtras(); }, [loadExtras]));

  if (loading || error || !resident) {
    return <ScreenState loading={loading} error={error || (!resident ? 'Resident not found' : null)} onBack={() => navigation.goBack()} />;
  }

  const notice = (title, message) => setModal({ title, message });
  const closeModal = () => setModal(null);
  const activeCard = qrStatus.card;
  const pendingLinks = links.links.filter((link) => link.status === 'pending');
  const verifiedLinks = links.links.filter((link) => link.status === 'verified');

  // Officials of this barangay and the resident's guardian can change it.
  const changeResidentPhoto = () => changePhoto({
    title: `Photo of ${resident.name}`,
    hasPhoto: !!resident.photoUrl,
    save: async (image) => {
      const result = await setResidentPhoto(resident.id, image);
      setResident((current) => ({ ...current, photoUrl: result?.photo_url || null }));
    },
  });

  // ---- QR card -----------------------------------------------------------
  async function issueCard() {
    closeModal();
    if (qrBusy) return;
    setQrBusy(true);
    try {
      const issued = await api.generateQr({ residentId: resident.id });
      setQrData(issued);
      setShowQR(true);
      await loadExtras();
    } catch (err) { notice('Could not generate QR card', err.message); }
    finally { setQrBusy(false); }
  }

  function confirmIssue(replacing) {
    setModal({
      title: replacing ? 'Replace QR card?' : 'Generate QR card?',
      message: replacing || qrStatus.unavailable
        ? 'A new QR card will be issued. Any previously printed card for this resident will stop working immediately.'
        : 'A QR card will be issued for this resident. You can save or share it as a PDF afterwards.',
      actions: [
        { label: 'Cancel', onPress: closeModal, variant: 'plain' },
        { label: replacing ? 'Replace Card' : 'Generate Card', onPress: issueCard, variant: replacing || qrStatus.unavailable ? 'danger' : 'primary' },
      ],
    });
  }

  async function openQrCard() {
    if (qrBusy) return;
    if (qrData) { setShowQR(true); return; }
    if (!activeCard) { confirmIssue(false); return; }
    setQrBusy(true);
    try {
      if (!activeCard.reexportable) { const legacy = new Error('legacy'); legacy.code = 'QR_EXPORT_UNAVAILABLE'; throw legacy; }
      setQrData(await api.exportExistingQr({ cardId: activeCard.id }));
      setShowQR(true);
    } catch (err) {
      // Never replace automatically: keeping the current card is the default.
      const message = err.code === 'QR_EXPORT_UNAVAILABLE'
        ? 'This card was issued before secure re-export, so it can’t be shown again. The printed card still works — keep using it. Replace it only if it is lost or damaged; the old card will then stop working.'
        : err.code === PENDING
        ? 'Showing an existing card needs a backend update that isn’t deployed yet. The printed card still works — keep using it.'
        : err.code === 'QR_CARD_NOT_FOUND'
        ? 'This resident has no active QR card. Generate one to print a card.'
        : err.message;
      setModal({
        title: 'Card can’t be shown again',
        message,
        actions: [
          { label: 'Keep Current Card', onPress: closeModal, variant: 'primary' },
          { label: 'Replace Card', onPress: () => confirmIssue(true), variant: 'danger' },
        ],
      });
    } finally { setQrBusy(false); }
  }

  function confirmRevoke() {
    const card = qrData?.id ? qrData : activeCard;
    if (!card?.id) return;
    setModal({
      title: 'Revoke QR card?',
      message: 'The printed card will stop working immediately. Bystanders scanning it will not reach this resident until a new card is issued.',
      actions: [
        { label: 'Cancel', onPress: closeModal, variant: 'plain' },
        { label: 'Revoke Card', variant: 'danger', onPress: async () => {
          closeModal();
          setQrBusy(true);
          try {
            await api.revokeQr(card.id, 'Revoked by an authorized official from the resident profile.');
            setQrData(null);
            setShowQR(false);
            await loadExtras();
            notice('QR card revoked', 'The previous QR card can no longer be used.');
          } catch (err) { notice('Could not revoke QR card', err.message); }
          finally { setQrBusy(false); }
        } },
      ],
    });
  }

  // Exports the card on screen; never issues, replaces or revokes a card.
  async function saveQrCard() {
    if (!qrData?.publicScanUrl || qrBusy) return;
    setQrBusy(true);
    try { await exportQrCard(qrRef); }
    catch (err) { notice('Could not save QR card', err.message); }
    finally { setQrBusy(false); }
  }

  // ---- Guardian relationships -------------------------------------------
  async function openLinkGuardian() {
    setGuardianApprovalConfirmed(false);
    setLinkForm({ guardianId: '', relationship: '' });
    try {
      const [all, currentLinks, accountStatuses] = await Promise.all([
        api.listGuardians(),
        api.listResidentGuardianLinks(resident.id),
        api.listAccountStatus().catch(() => null),
      ]);
      if (!currentLinks.unavailable) setLinks(currentLinks);
      const statusMap = accountStatuses instanceof Map ? accountStatuses : new Map();
      setGuardianAccountStatuses(statusMap);
      const linkedIds = new Set(currentLinks.links.filter((link) => ['pending', 'verified'].includes(link.status)).map((link) => link.guardianId));
      setGuardians(all.filter((guardian) => (statusMap.has(guardian.id)
        ? statusMap.get(guardian.id)?.hasAuthUser === true
        : guardian.is_active !== false) && !linkedIds.has(guardian.id)));
    } catch (err) { setLinkForm(null); notice('Could not load guardians', err.message); }
  }

  async function approvePendingLink(link) {
    if (!link?.id || linkBusy) return;
    setLinkBusy(true);
    try {
      await api.approveGuardianRelationship({ residentId: resident.id, guardianId: link.guardianId, relationship: link.relationship, context: 'pending_review' });
      await Promise.all([loadExtras(), refresh()]);
      notice('Guardian Linked', `${link.guardianName} is now recorded as an approved guardian. Resident access still requires an eligible, active account.`);
    } catch (err) { notice('Could not approve relationship', err.message); }
    finally { setLinkBusy(false); }
  }

  async function submitUnlink(reason) {
    const target = unlinkTarget;
    if (!target || linkBusy) return;
    setLinkBusy(true);
    try {
      await api.unlinkGuardianRelationship(target.id, reason);
      setUnlinkTarget(null);
      await Promise.all([loadExtras(), refresh()]);
      notice('Guardian unlinked', `${target.guardianName} no longer has access through this resident relationship.`);
    } catch (err) { notice('Could not unlink guardian', err.message); }
    finally { setLinkBusy(false); }
  }

  async function resendInvitation(link) {
    if (!link?.guardianId || linkBusy) return;
    setLinkBusy(true);
    try {
      const result = await api.resendGuardianInvitation(link.guardianId);
      await loadExtras();
      notice(result.authAccepted ? 'Resend request accepted' : 'Invitation status needs review', result.authAccepted
        ? 'Supabase accepted the resend request. Email delivery is not confirmed. The guardian must confirm their email, and an official must activate the account.'
        : 'Supabase did not confirm that it accepted the resend request. Check Auth and email-provider logs before trying again.');
    } catch (err) { notice('Could not resend invitation', err.message); }
    finally { setLinkBusy(false); }
  }

  async function submitLink() {
    if (linkBusy || !linkForm?.guardianId || !linkForm?.relationship || !guardianApprovalConfirmed) return;
    const guardian = guardians.find((item) => item.id === linkForm.guardianId);
    setLinkBusy(true);
    try {
      await api.linkGuardianToResident({ residentId: resident.id, guardianId: linkForm.guardianId, relationship: linkForm.relationship });
      setLinkForm(null);
      setGuardianApprovalConfirmed(false);
      await Promise.all([loadExtras(), refresh()]);
      notice('Guardian Linked', `${guardian?.fullName || 'The selected guardian'} was approved and linked to ${resident.name}.`);
    } catch (err) {
      await loadExtras();
      const message = err.code === 'GUARDIAN_LINK_EXISTS'
        ? err.message
        : err.code === '23505' || /one_currentguardian_link/i.test(err.message || '')
        ? 'A current relationship with this guardian already exists. Refresh and review its status instead of creating another.'
        : err.message;
      notice('Could not link guardian', message);
    }
    finally { setLinkBusy(false); }
  }

  if (showQR && qrData?.publicScanUrl) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <BrandHeader title="Resident QR card" onBack={() => setShowQR(false)} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.qrScroll}>
          <QrOwnerSummary name={resident.name} category={resident.type}
            photo={<Avatar uri={resident.photoUrl} name={resident.name} style={styles.qrPhoto} />} />
          <QrCardPanel value={qrData.publicScanUrl} qrRef={qrRef} code={resident.code} />
          <QrActionGrid>
            <QrAction variant="save" label={qrBusy ? 'Please wait…' : 'Save PDF'} disabled={qrBusy} onPress={saveQrCard} />
            <QrAction half variant="replace" label="Replace QR" disabled={qrBusy} onPress={() => confirmIssue(true)} />
            <QrAction half variant="revoke" label="Revoke QR" disabled={qrBusy} onPress={confirmRevoke} />
          </QrActionGrid>
        </ScrollView>
        <AppModal visible={!!modal} title={modal?.title} onClose={closeModal} actions={modal?.actions}>
          <Text style={styles.modalText}>{modal?.message}</Text>
        </AppModal>
      </SafeAreaView>
    );
  }

  const qrLabel = qrBusy ? 'Please wait…' : (qrData || activeCard) ? 'View QR Card' : qrStatus.unavailable ? 'Issue QR Card' : 'Generate QR Card';

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <BrandHeader title="Resident profile" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={[styles.residentCard, styles.shadow]}>
          <Avatar uri={resident.photoUrl} name={resident.name} style={styles.residentPhoto} onChangePress={changeResidentPhoto} />
          <View style={{ flex: 1, margin: 0 }}>
            <Text style={styles.contextTitle}>{resident.name}</Text>
            <Text style={styles.small}>Type: {resident.type || 'Resident'}</Text>
            {!qrStatus.unavailable && (
              <Text style={[styles.cardPill, activeCard ? styles.verified : styles.pending]}>
                {activeCard ? 'QR card active' : 'No active QR card'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.editButton} onPress={() => navigation.navigate('EditResidentInfo', { resident })}>
            <Text style={styles.editButtonText}>Edit Information</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qrButton} disabled={qrBusy} onPress={() => (qrStatus.unavailable && !qrData ? confirmIssue(false) : openQrCard())}>
            <Text style={styles.qrButtonText}>{qrLabel}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>Personal Information</Text>
        <View style={styles.card}>
          <InfoRow label="Full Name" value={resident.name} />
          <Divider />
          <InfoRow label="Date of Birth" value={resident.birthDate} />
          <Divider />
          <InfoRow label="Address" value={resident.address} />
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.section}>Guardian Information</Text>
          <TouchableOpacity onPress={openLinkGuardian} disabled={linkBusy} accessibilityRole="button">
            <Text style={styles.linkAction}>+ Link Guardian</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {verifiedLinks.length ? verifiedLinks.map((link, index) => (
            <React.Fragment key={link.id}>
              {index > 0 && <Divider />}
              <View style={styles.linkRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkName}>{link.guardianName}</Text>
                  <Text style={styles.historyMeta}>{link.relationship} · {link.guardianEmail || link.guardianPhone || 'No contact on file'}</Text>
                  <View style={styles.pillRow}>
                    <Text style={[styles.cardPill, styles.verified]}>Guardian Linked</Text>
                    <Text style={[styles.cardPill, accountStatusStyle(link)]}>{accountStatusLabel(link)}</Text>
                  </View>
                  {link.hasAuthUser && !link.guardianActive && !link.emailConfirmed && (
                    <TouchableOpacity style={styles.smallAction} disabled={linkBusy} onPress={() => resendInvitation(link)}>
                      <Text style={styles.smallActionText}>{linkBusy ? 'Please wait…' : 'Resend invitation'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity style={styles.unlinkButton} disabled={linkBusy} onPress={() => setUnlinkTarget(link)}>
                  <Text style={styles.unlinkButtonText}>Unlink</Text>
                </TouchableOpacity>
              </View>
            </React.Fragment>
          )) : resident.guardianName ? <>
            <InfoRow label="Guardian Name" value={resident.guardianName} />
            <Divider />
            <InfoRow label="Relationship" value={resident.relationship} />
            <Divider />
            <InfoRow label="Contact Number" value={resident.guardianContact} />
          </> : <Text style={styles.emptyText}>No guardian linked. Assistance can still be requested for this resident.</Text>}
        </View>

        {pendingLinks.length > 0 && <>
          <Text style={styles.section}>Relationships awaiting official review</Text>
          <View style={styles.card}>
            {pendingLinks.map((link, index) => (
              <React.Fragment key={link.id}>
                <View style={styles.linkRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkName}>{link.guardianName}</Text>
                    <Text style={styles.historyMeta}>{link.relationship} · {link.guardianEmail || link.guardianPhone || 'No contact on file'}</Text>
                    <View style={styles.pillRow}>
                      <Text style={[styles.cardPill, styles.pending]}>Pending official review</Text>
                      <Text style={[styles.cardPill, accountStatusStyle(link)]}>{accountStatusLabel(link)}</Text>
                    </View>
                  </View>
                  <View style={styles.linkActions}>
                    <TouchableOpacity style={styles.reviewButton} disabled={linkBusy} onPress={() => approvePendingLink(link)}>
                      <Text style={styles.reviewText}>{linkBusy ? 'Please wait…' : 'Review & confirm'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.unlinkButton} disabled={linkBusy} onPress={() => setUnlinkTarget(link)}>
                      <Text style={styles.unlinkButtonText}>Unlink</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {index < pendingLinks.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </View>
        </>}
        {verifiedLinks.length > 1 && (
          <Text style={styles.historyMeta}>{verifiedLinks.length} verified guardians are linked; the primary one is shown above.</Text>
        )}

        <Text style={styles.section}>Assistance History</Text>
        <View style={styles.card}>
          {residentAlerts.length === 0 ? (
            <Text style={styles.emptyText}>No assistance requests yet.</Text>
          ) : residentAlerts.map((alert, index) => (
            <React.Fragment key={alert.id}>
              <TouchableOpacity
                style={styles.historyRow}
                onPress={() => navigation.navigate('AlertDetails', { alertId: alert.id })}
                activeOpacity={0.8}
              >
                <View style={styles.historyTextWrap}>
                  <View style={styles.historyTopRow}>
                    <Text style={[styles.statusPill, alert.status === 'closed' ? styles.closed : styles.danger]}>
                      {alertStageLabel(alert.status)}
                    </Text>
                    <Text style={styles.historyTime}>{alert.scannedAt}</Text>
                  </View>
                  <Text style={styles.historyMeta}>Reported by {alert.scannedBy}</Text>
                  <Text style={styles.historyMeta}>{alert.location || 'Location unavailable'}</Text>
                </View>
                <FontAwesome5 name="chevron-right" size={11} color={colors.textMuted} />
              </TouchableOpacity>
              {index < residentAlerts.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>

      <AppModal
        visible={!!linkForm}
        title="Link a guardian"
        onClose={() => { setLinkForm(null); setGuardianApprovalConfirmed(false); }}
        actions={[
          { label: 'Cancel', onPress: () => { setLinkForm(null); setGuardianApprovalConfirmed(false); }, variant: 'plain', disabled: linkBusy },
          { label: linkBusy ? 'Saving…' : 'Confirm and link', onPress: submitLink, variant: 'primary', disabled: linkBusy || !linkForm?.guardianId || !linkForm?.relationship || !guardianApprovalConfirmed },
        ]}
      >
        <Text style={styles.modalText}>Choose an eligible guardian and confirm the relationship before saving. Account activation and email confirmation remain separate requirements.</Text>
        {guardians.length === 0 ? (
          <Text style={styles.emptyText}>No unlinked guardian accounts are available. Review any pending or verified relationships above.</Text>
        ) : guardians.map((guardian) => {
          const selected = linkForm?.guardianId === guardian.id;
          return (
            <TouchableOpacity key={guardian.id} style={[styles.choice, selected && styles.choiceActive]} onPress={() => { setLinkForm((form) => ({ ...form, guardianId: guardian.id })); setGuardianApprovalConfirmed(false); }}>
              <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{guardian.fullName}</Text>
              <Text style={styles.historyMeta}>{guardian.email || guardian.phoneNumber || 'No contact on file'}</Text>
            </TouchableOpacity>
          );
        })}
        {!!linkForm?.guardianId && (
          <View style={styles.selectedGuardianCard}>
            <Text style={styles.selectedGuardianLabel}>Selected guardian</Text>
            <Text style={styles.linkName}>{guardians.find((guardian) => guardian.id === linkForm.guardianId)?.fullName || 'Selected guardian'}</Text>
            <Text style={styles.historyMeta}>{accountStatusLabel({
              ...guardianAccountStatuses.get(linkForm.guardianId),
              guardianActive: guardians.find((guardian) => guardian.id === linkForm.guardianId)?.is_active === true,
            })}</Text>
          </View>
        )}
        <Text style={[styles.modalText, { marginTop: 10 }]}>Relationship <Text style={{ color: colors.primary }}>*</Text></Text>
        <View style={styles.pillRow}>
          {RELATIONSHIPS.map((value) => {
            const selected = linkForm?.relationship === value;
            return (
              <TouchableOpacity key={value} style={[styles.chip, selected && styles.choiceActive]} onPress={() => { setLinkForm((form) => ({ ...form, relationship: value })); setGuardianApprovalConfirmed(false); }}>
                <Text style={[styles.historyMeta, selected && styles.choiceTextActive]}>{value}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={styles.approvalRow} onPress={() => setGuardianApprovalConfirmed((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: guardianApprovalConfirmed }}>
          <View style={[styles.approvalBox, guardianApprovalConfirmed && styles.approvalBoxChecked]}>{guardianApprovalConfirmed ? <Text style={styles.approvalMark}>✓</Text> : null}</View>
          <Text style={styles.approvalText}>I confirm that this person is authorized to act as the resident's guardian.</Text>
        </TouchableOpacity>
      </AppModal>

      <ReasonPromptModal
        visible={!!unlinkTarget}
        title={`Unlink ${unlinkTarget?.guardianName || 'guardian'} from ${resident.name}?`}
        placeholder="Record the reason for changing or ending this guardian relationship"
        confirmLabel="Unlink Guardian"
        submitting={linkBusy}
        onCancel={() => setUnlinkTarget(null)}
        onSubmit={submitUnlink}
      />
      <AppModal visible={!!modal} title={modal?.title} onClose={closeModal} actions={modal?.actions}>
        <Text style={styles.modalText}>{modal?.message}</Text>
      </AppModal>
      {(qrBusy || linkBusy) && <ActivityIndicator style={styles.busy} color={colors.primary} />}
      <TabBar />
    </SafeAreaView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '-'}</Text>
    </View>
  );
}

function accountStatusLabel(link) {
  if (link.hasAuthUser === false) return 'Invitation needs attention';
  if (link.hasAuthUser === true && !link.emailConfirmed) return 'Awaiting email confirmation';
  if (link.emailConfirmed && !link.guardianActive) return 'Awaiting account activation';
  if (link.emailConfirmed && link.guardianActive) return 'Active guardian';
  return 'Account status unavailable';
}

function accountStatusStyle(link) {
  if (link.emailConfirmed && link.guardianActive) return styles.verified;
  if (link.emailConfirmed || link.hasAuthUser === true) return styles.pending;
  return styles.inactive;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screen, paddingTop: 4, paddingBottom: 0 },
  scrollContent: { padding: spacing.screen, paddingTop: 4, paddingBottom: 30 },
  back: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.primary, marginBottom: 4, marginTop: 0, minHeight: 44, paddingVertical: 4 },
  heading: { fontSize: typography.title, fontFamily: 'Poppins_700Bold', marginBottom: 8 },

  residentCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, padding: spacing.card, marginBottom: 12, ...shadow.card },
  residentPhoto: { width: 88, height: 104, borderRadius: 14, backgroundColor: colors.primarySoft, marginRight: 14 },
  contextTitle: { fontSize: typography.section, fontFamily: 'Poppins_700Bold', color: colors.textPrimary, letterSpacing: -0.3, lineHeight: 28 },
  small: { fontSize: typography.caption, color: colors.textSecondary, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 },

  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  editButton: { flex: 1, backgroundColor: colors.surface, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  editButtonText: { color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: typography.detail },
  qrButton: { flex: 1, backgroundColor: colors.primary, borderColor: colors.primary, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  qrButtonText: { color: colors.onPrimary, fontFamily: 'Poppins_600SemiBold', fontSize: typography.detail },

  section: { fontSize: typography.body, fontFamily: 'Poppins_700Bold', color: colors.textPrimary, marginTop: 20, marginBottom: 8 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  linkAction: { color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: typography.caption, paddingVertical: 8, marginBottom: 4 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: spacing.card, paddingVertical: 4, backgroundColor: colors.surface, ...shadow.card },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, alignSelf: 'stretch' },
  infoLabel: { fontSize: typography.caption, fontFamily: 'Poppins_400Regular', color: colors.textSecondary },
  infoValue: { flex: 1, textAlign: 'right', marginLeft: 15, fontSize: typography.caption, fontFamily: 'Poppins_500Medium', color: colors.textPrimary },

  cardPill: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4, fontSize: typography.caption, fontFamily: 'Poppins_600SemiBold', overflow: 'hidden' },
  verified: { color: colors.successInk, backgroundColor: colors.successSoft },
  pending: { color: colors.warningInk, backgroundColor: colors.warningSoft },
  inactive: { color: colors.textSecondary, backgroundColor: colors.border },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },

  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  linkName: { fontSize: typography.detail, fontFamily: 'Poppins_600SemiBold', color: colors.textPrimary },
  reviewButton: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, minHeight: 42, justifyContent: 'center' },
  reviewText: { color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: typography.caption },
  linkActions: { alignItems: 'stretch', gap: 6 },
  smallAction: { alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: colors.primaryBorder, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, minHeight: 40, justifyContent: 'center' },
  smallActionText: { color: colors.primary, fontSize: typography.caption, fontFamily: 'Poppins_600SemiBold' },
  unlinkButton: { borderWidth: 1, borderColor: colors.alertInk, backgroundColor: colors.alertSoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, minHeight: 42, justifyContent: 'center' },
  unlinkButtonText: { color: colors.alertInk, fontFamily: 'Poppins_600SemiBold', fontSize: typography.caption },
  selectedGuardianCard: { borderWidth: 1, borderColor: colors.primaryBorder, borderRadius: 14, backgroundColor: colors.primarySoft, padding: spacing.card, marginTop: 10 },
  selectedGuardianLabel: { color: colors.textSecondary, fontSize: typography.caption, fontFamily: 'Poppins_500Medium', marginBottom: 4 },
  approvalRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, padding: spacing.card, marginTop: 12, minHeight: spacing.control },
  approvalBox: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  approvalBoxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  approvalMark: { color: colors.onPrimary, fontSize: typography.detail, fontFamily: 'Poppins_600SemiBold' },
  approvalText: { flex: 1, fontSize: typography.detail, fontFamily: 'Poppins_500Medium', color: colors.textPrimary, lineHeight: Math.ceil(typography.detail * 1.45) },

  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  historyTextWrap: { flex: 1 },
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, fontSize: typography.caption, fontFamily: 'Poppins_600SemiBold' },
  danger: { color: colors.alertInk, backgroundColor: colors.alertSoft },
  closed: { color: colors.successInk, backgroundColor: colors.successSoft },
  historyTime: { fontSize: typography.caption, fontFamily: 'Poppins_400Regular', color: colors.textSecondary },
  historyMeta: { fontSize: typography.caption, fontFamily: 'Poppins_400Regular', color: colors.textSecondary, marginTop: 2 },
  emptyText: { textAlign: 'center', fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.textMuted, padding: 14 },

  modalText: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.textPrimary },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, marginTop: 8 },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { fontSize: typography.detail, fontFamily: 'Poppins_500Medium', color: colors.textPrimary },
  choiceTextActive: { color: colors.primary, fontFamily: 'Poppins_600SemiBold' },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  busy: { position: 'absolute', top: '45%', alignSelf: 'center' },

  qrPhoto: { width: 72, height: 84, borderRadius: 14, backgroundColor: colors.primarySoft },
  qrScroll: { padding: spacing.screen, paddingTop: 4, paddingBottom: spacing.screen + 16 },
  qrBox: { margin: 20, marginTop: 10, borderWidth: 1, borderColor: colors.primary, borderRadius: 14, padding: 20, paddingTop: 30, paddingBottom: 10, alignItems: 'center', backgroundColor: colors.primarySoft },
  qrName: { fontSize: typography.section, fontFamily: 'Poppins_600SemiBold', color: colors.primary, marginTop: 20 },
  primaryButton: { marginTop: 18, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginHorizontal: 20, minHeight: spacing.control, justifyContent: 'center' },
  primaryButtonText: { color: colors.onPrimary, fontFamily: 'Poppins_600SemiBold' },
  revokeButton: { borderColor: colors.alertInk, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginHorizontal: 20, marginTop: 10, minHeight: 44, justifyContent: 'center' },
  revokeButtonText: { color: colors.alertInk, fontFamily: 'Poppins_600SemiBold' },

  shadow: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0, shadowRadius: 4, elevation: 0 },
});
